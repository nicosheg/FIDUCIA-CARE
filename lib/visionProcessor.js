// lib/visionProcessor.js
import pool from './db';
import { enqueueVisionJob } from './visionQueue';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ---------- Helpers ----------
function extractPeopleFromText(rawContent) {
  if (!rawContent) return [];
  let text = rawContent.replace(/```json|```/g, '').trim();
  if (text.includes('</think>')) text = text.split('</think>')[1].trim();
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { const parsed = JSON.parse(arrayMatch[0]); if (Array.isArray(parsed)) return parsed; } catch {}
    const repaired = arrayMatch[0].replace(/,\s*]/g, ']').replace(/,\s*}/g, '}').replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
    try { const parsed = JSON.parse(repaired); if (Array.isArray(parsed)) return parsed; } catch {}
  }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { const obj = JSON.parse(objMatch[0]); if (obj.name) return [obj]; } catch {}
  }
  return [];
}

function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('0')) cleaned = '+234' + cleaned.substring(1);
  else if (cleaned.startsWith('234') && !cleaned.startsWith('+')) cleaned = '+' + cleaned;
  if (cleaned === '+234' || cleaned.length < 10) cleaned = '';
  return cleaned;
}

async function determineRelationshipStage(client, orgId, name, phone) {
  // Check if person already exists by phone or name
  if (phone) {
    const existing = await client.query(
      `SELECT id, created_at, confidence FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
      [orgId, phone]
    );
    if (existing.rows.length > 0) {
      const person = existing.rows[0];
      // Check attendance history to refine stage
      const attendanceCount = await client.query(
        `SELECT COUNT(*) as cnt FROM attendance_records ar
         JOIN people p ON ar.member_id = p.id
         WHERE p.id = $1 AND ar.present = true`,
        [person.id]
      );
      const total = parseInt(attendanceCount.rows[0].cnt) || 0;
      if (total <= 2) return 'first_time';
      if (total >= 5) return 'regular';
      return 'returning';
    }
  }
  // No phone or not found – check by name similarity
  if (name) {
    const similar = await client.query(
      `SELECT id, created_at FROM people WHERE organization_id = $1 AND first_name ILIKE $2 LIMIT 1`,
      [orgId, `%${name}%`]
    );
    if (similar.rows.length > 0) {
      return 'familiar_face';
    }
  }
  return 'new_visitor';
}

// ---------- Main processor ----------
export async function processVisionJob(jobId, imageBase64, orgId, programName) {
  const client = await pool.connect();
  try {
    await client.query(`UPDATE scan_jobs SET progress = 'enhancing' WHERE id = $1`, [jobId]);

    // Vision task
    const visionTask = async () => {
      const systemPrompt = `You are ARIA. Extract every person's name and phone number from this church attendance register photo. Return ONLY a JSON array of { "name": "...", "phone": "..." }. No other text.`;
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: GROQ_VISION_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: [
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
              { type: 'text', text: 'Output the JSON array now.' }
            ]}
          ],
          temperature: 0, max_tokens: 2000, stream: false,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        const msg = err.error?.message || 'Groq error';
        if (msg.includes('Please try again in')) {
          const match = msg.match(/in (\d+\.?\d*)s/);
          if (match) throw { rateLimit: true, waitSec: parseFloat(match[1]) + 2, message: msg };
        }
        throw new Error(msg);
      }
      return await response.json();
    };

    await client.query(`UPDATE scan_jobs SET progress = 'reading_handwriting' WHERE id = $1`, [jobId]);
    let people = [];
    try {
      let data = await enqueueVisionJob(visionTask);
      let rawContent = data.choices[0].message.content;
      people = extractPeopleFromText(rawContent);
      if (!people || people.length === 0) {
        data = await enqueueVisionJob(visionTask);
        rawContent = data.choices[0].message.content;
        people = extractPeopleFromText(rawContent);
      }
    } catch (err) {
      await client.query(`UPDATE scan_jobs SET status = 'failed', result = $2, progress = 'failed' WHERE id = $1`,
        [jobId, JSON.stringify({ error: err.message })]);
      return;
    }

    await client.query(`UPDATE scan_jobs SET progress = 'matching_community' WHERE id = $1`, [jobId]);
    const uniquePeople = [];
    const seen = new Set();
    for (const p of people) {
      const name = (p.name || '').trim();
      const phone = normalizePhone(p.phone);
      if (!name || /^[0-9+\-\s]+$/.test(name)) continue;
      if (name.toLowerCase() === 'names' || name.toLowerCase() === 'phone number') continue;
      const key = `${name}|${phone}`;
      if (!seen.has(key)) {
        seen.add(key);
        const stage = await determineRelationshipStage(client, orgId, name, phone);
        uniquePeople.push({ name, phone, relationship_stage: stage, needs_review: stage === 'new_visitor' });
      }
      if (uniquePeople.length >= 50) break;
    }

    await client.query(`UPDATE scan_jobs SET progress = 'building_memory' WHERE id = $1`, [jobId]);

    // Insert into database
    const savedPeople = [];
    let newMembersCount = 0;
    for (const person of uniquePeople) {
      const fullName = person.name;
      const phone = person.phone;
      try {
        const insertRes = await client.query(
          `INSERT INTO people (organization_id, first_name, last_name, phone, type, status, confidence)
           VALUES ($1, $2, '', $3, 'visitor', 'active', 85) RETURNING id`,
          [orgId, fullName, phone]
        );
        savedPeople.push(insertRes.rows[0].id);
        newMembersCount++;
      } catch (insertErr) {
        if (phone) {
          const existing = await client.query(
            `SELECT id FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`, [orgId, phone]
          );
          if (existing.rows.length > 0) {
            savedPeople.push(existing.rows[0].id);
            await client.query(`UPDATE people SET first_name = $1 WHERE id = $2`, [fullName, existing.rows[0].id]);
          }
        }
      }
    }

    // Attendance & timeline
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
      `SELECT id FROM session_sections WHERE session_id = $1 AND name = 'All'`, [sessionId]
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

    const allActive = await client.query(`SELECT id FROM people WHERE organization_id = $1 AND status = 'active'`, [orgId]);
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

    const result = {
      status: 'ok',
      present_count: savedPeople.length,
      absent_count: allActiveIds.length - savedPeople.length,
      new_members: newMembersCount,
      people: uniquePeople,
      needs_review: uniquePeople.filter(p => p.needs_review).length,
    };
    await client.query(
      `UPDATE scan_jobs SET status = 'complete', progress = 'complete', result = $2 WHERE id = $1`,
      [jobId, JSON.stringify(result)]
    );
  } catch (error) {
    await client.query(
      `UPDATE scan_jobs SET status = 'failed', progress = 'failed', result = $2 WHERE id = $1`,
      [jobId, JSON.stringify({ error: error.message })]
    );
  } finally {
    client.release();
  }
}
