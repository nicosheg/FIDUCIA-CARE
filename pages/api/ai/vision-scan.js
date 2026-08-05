import pool from '../../../lib/db';
import { enqueueVisionJob } from '../../../lib/visionQueue';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ---------- Helpers ----------

/** Robustly extract a JSON array from a messy model response */
function extractPeopleFromText(rawContent) {
  if (!rawContent) return [];

  // Remove markdown fences
  let text = rawContent.replace(/```json|```/g, '').trim();

  // If there's a reasoning block, take only the part after </think>
  if (text.includes('</think>')) {
    text = text.split('</think>')[1].trim();
  }

  // Try to find a JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Attempt to repair malformed JSON (common issues)
      const repaired = arrayMatch[0]
        .replace(/,\s*]/g, ']')          // trailing commas
        .replace(/,\s*}/g, '}')          // trailing commas in objects
        .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":'); // unquoted keys
      try {
        const parsed = JSON.parse(repaired);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
  }

  // Try to find a JSON object (maybe it returned a single person)
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      const obj = JSON.parse(objectMatch[0]);
      if (obj.name) return [obj];
    } catch {}
  }

  return [];
}

/** Normalize Nigerian phone numbers */
function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('0')) cleaned = '+234' + cleaned.substring(1);
  else if (cleaned.startsWith('234') && !cleaned.startsWith('+')) cleaned = '+' + cleaned;
  if (cleaned === '+234' || cleaned.length < 10) cleaned = '';
  return cleaned;
}

/** Heuristic confidence score */
function estimateConfidence(name, phone) {
  let score = 70;
  if (name && name.length > 3) score += 10;
  if (name && /^[A-Z]/.test(name)) score += 5; // starts with capital
  if (phone && phone.length >= 13) score += 10; // full +234 number
  if (phone && phone.startsWith('+234')) score += 5;
  if (name && /^(Bro|Sis|Pastor|Mrs|Mr|Evang|Deacon)/i.test(name)) score += 5;
  return Math.min(score, 100);
}

/** Check database for potential duplicates */
async function detectDuplicates(client, orgId, people) {
  const duplicates = [];
  for (const person of people) {
    const name = person.name.trim();
    const phone = person.phone;
    if (!name && !phone) continue;

    let query = `SELECT id, first_name, phone FROM people WHERE organization_id = $1 AND (`;
    const params = [orgId];
    if (name) {
      query += `first_name ILIKE $${params.length + 1} `;
      params.push(`%${name}%`);
    }
    if (phone) {
      if (name) query += `OR `;
      query += `phone = $${params.length + 1} `;
      params.push(phone);
    }
    query += `) AND status = 'active' LIMIT 1`;

    try {
      const existing = await client.query(query, params);
      if (existing.rows.length > 0) {
        duplicates.push({
          ...person,
          duplicate_of: existing.rows[0].id,
          duplicate_name: existing.rows[0].first_name,
          duplicate_phone: existing.rows[0].phone,
        });
      }
    } catch (err) {
      // continue
    }
  }
  return duplicates;
}

// ---------- Main Handler ----------

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { image_base64, church_id, program_name } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'No image data' });

  const orgId = church_id || 'demo-org';
  const programName = program_name || 'GIBEON';

  // The actual vision API call (will be queued)
  const visionTask = async () => {
    // NO response_format to avoid JSON validation failures
    const systemPrompt = `You are ARIA, an intelligent assistant for FIDUCIA CARE. You receive a photo of a church attendance register with two columns: Names and Phone Numbers. Extract each person as a JSON array of objects with fields "name" and "phone". Phone numbers should be normalized to international format (+234XXXXXXXXXX). If a name or phone is unclear, leave it empty. Return ONLY the JSON array, no other text. Do not include markdown fences.`;

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image_base64}` } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 4000,
        // NO response_format
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      const msg = err.error?.message || 'Groq vision API error';
      if (msg.includes('Please try again in')) {
        const match = msg.match(/in (\d+\.?\d*)s/);
        if (match) {
          const waitSec = parseFloat(match[1]) + 2;
          throw { rateLimit: true, waitSec, message: msg };
        }
      }
      throw new Error(msg);
    }

    return await response.json();
  };

  // ---------- Execute with retry ----------
  let people = [];
  try {
    // First attempt
    let data;
    try {
      data = await enqueueVisionJob(visionTask);
    } catch (err) {
      if (err.rateLimit) {
        console.log(`Rate limited, waiting ${err.waitSec}s...`);
        await new Promise(resolve => setTimeout(resolve, err.waitSec * 1000));
        data = await enqueueVisionJob(visionTask);
      } else {
        throw err;
      }
    }

    const rawContent = data.choices[0].message.content;
    console.log('ARIA raw response:', rawContent);

    // Extract and repair JSON
    people = extractPeopleFromText(rawContent);
    console.log('Extracted people (first pass):', people.length);

    // If no people, retry once more
    if (!people || people.length === 0) {
      console.log('First extraction yielded no people, retrying...');
      try {
        const retryData = await enqueueVisionJob(visionTask);
        const retryContent = retryData.choices[0].message.content;
        console.log('ARIA retry response:', retryContent);
        people = extractPeopleFromText(retryContent);
      } catch (retryErr) {
        console.error('Retry failed:', retryErr.message);
      }
    }

    // Normalize phones, filter junk, compute confidence
    const uniquePeople = [];
    const seen = new Set();
    for (const p of people) {
      const name = (p.name || '').trim();
      const phone = normalizePhone(p.phone);
      // Skip purely numeric names and headers
      if (!name || /^[0-9+\-\s]+$/.test(name)) continue;
      if (name.toLowerCase() === 'names' || name.toLowerCase() === 'phone number') continue;

      const key = `${name}|${phone}`;
      if (!seen.has(key)) {
        seen.add(key);
        const confidence = estimateConfidence(name, phone);
        uniquePeople.push({ name, phone, confidence, needs_review: confidence < 70 });
      }
      if (uniquePeople.length >= 50) break; // safety valve
    }

    if (uniquePeople.length === 0) {
      return res.status(200).json({
        status: 'ok',
        present_count: 0,
        absent_count: 0,
        new_members: 0,
        people: [],
        message: 'ARIA could not read any names. Please try a clearer photo.',
      });
    }

    // ---------- Insert into database ----------
    const client = await pool.connect();
    const savedPeople = [];
    let newMembersCount = 0;

    for (const person of uniquePeople) {
      const fullName = person.name;
      const phone = person.phone;

      try {
        const insertRes = await client.query(
          `INSERT INTO people (organization_id, first_name, last_name, phone, type, status, confidence)
           VALUES ($1, $2, '', $3, 'visitor', 'active', $4)
           RETURNING id`,
          [orgId, fullName, phone, person.confidence]
        );
        savedPeople.push(insertRes.rows[0].id);
        newMembersCount++;
      } catch (insertErr) {
        // Duplicate phone – reuse existing ID
        if (phone) {
          const existing = await client.query(
            `SELECT id FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
            [orgId, phone]
          );
          if (existing.rows.length > 0) {
            savedPeople.push(existing.rows[0].id);
            await client.query(
              `UPDATE people SET first_name = $1, confidence = $2 WHERE id = $3`,
              [fullName, person.confidence, existing.rows[0].id]
            );
          }
        }
      }
    }

    // Duplicate detection (against existing database)
    const duplicates = await detectDuplicates(client, orgId, uniquePeople);

    // Record attendance & timeline
    const today = new Date().toISOString().slice(0, 10);
    let sessionId;
    let sessionRes = await client.query(
      `SELECT id FROM sessions WHERE church_id = $1 AND name = $2 AND created_at::date = $3`,
      [orgId, programName, today]
    );
    if (sessionRes.rows.length === 0) {
      const newSession = await client.query(
        `INSERT INTO sessions (church_id, name, status) VALUES ($1, $2, 'active') RETURNING id`,
        [orgId, programName]
      );
      sessionId = newSession.rows[0].id;
      await client.query(`INSERT INTO session_sections (session_id, name) VALUES ($1, 'All')`, [sessionId]);
    } else {
      sessionId = sessionRes.rows[0].id;
    }
    const sectionRes = await client.query(
      `SELECT id FROM session_sections WHERE session_id = $1 AND name = 'All'`,
      [sessionId]
    );
    const sectionId = sectionRes.rows[0].id;

    for (const personId of savedPeople) {
      await client.query(
        `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (member_id, attendance_date) DO UPDATE SET present = true`,
        [personId, today, sectionId]
      );
      await client.query(
        `INSERT INTO timeline_events (person_id, organization_id, event_type, description, metadata)
         VALUES ($1, $2, 'attendance', 'Present at ' || $3, ('{"program": "' || $3 || '"}')::jsonb)`,
        [personId, orgId, programName]
      );
    }

    // Mark absentees
    const allActive = await client.query(
      `SELECT id FROM people WHERE organization_id = $1 AND status = 'active'`,
      [orgId]
    );
    const allActiveIds = allActive.rows.map(r => r.id);
    for (const id of allActiveIds) {
      if (!savedPeople.includes(id)) {
        await client.query(
          `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
           VALUES ($1, $2, false, $3)
           ON CONFLICT (member_id, attendance_date) DO NOTHING`,
          [id, today, sectionId]
        );
      }
    }

    client.release();

    return res.status(200).json({
      status: 'ok',
      present_count: savedPeople.length,
      absent_count: allActiveIds.length - savedPeople.length,
      new_members: newMembersCount,
      people: uniquePeople,
      duplicates: duplicates,
      needs_review: uniquePeople.filter(p => p.needs_review).length,
    });
  } catch (error) {
    console.error('ARIA vision scan error:', error);
    return res.status(500).json({ status: 'failed', error: error.message || 'ARIA encountered an issue' });
  }
                        }
