import pool from '../../../lib/db';
import { enqueueVisionJob } from '../../../lib/visionQueue';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * ARIA Vision Scan – extract names and phone numbers directly from a register photo.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { image_base64, church_id, program_name } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'No image data' });

  const orgId = church_id || 'demo-org';
  const programName = program_name || 'GIBEON';

  // The actual vision API call (will be queued)
  const visionTask = async () => {
    const systemPrompt = `You are ARIA, an AI assistant for FIDUCIA CARE. This is a photo of a church attendance register with two columns: Names and Phone Numbers. Extract each person as a structured JSON array with 'name' and 'phone' fields. Normalize phone numbers to +234XXXXXXXXXX format (remove spaces/symbols). If a name or phone number is unclear, leave it empty rather than guessing. Return ONLY the JSON array, no other text.`;

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
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      const msg = err.error?.message || 'Groq vision API error';
      // Detect rate limit and throw special error so queue can retry
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

  try {
    // Enqueue the vision job – processes one at a time
    const data = await enqueueVisionJob(visionTask);
    const rawContent = data.choices[0].message.content;
    console.log('ARIA raw response:', rawContent);

    // ---------- Robust JSON parsing ----------
    let people = [];
    let jsonStr = rawContent;

    // Remove any thinking/reasoning block
    if (jsonStr.includes('</think>')) {
      jsonStr = jsonStr.split('</think>')[1].trim();
    }
    // Remove markdown fences
    jsonStr = jsonStr.replace(/```json|```/g, '').trim();

    // Try direct parse first (handles arrays, objects, and { people: [...] })
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        people = parsed;
      } else if (parsed && typeof parsed === 'object') {
        if (parsed.people && Array.isArray(parsed.people)) {
          people = parsed.people;
        } else if (parsed.name) {
          // Single person object – wrap in array
          people = [parsed];
        }
      }
    } catch {
      // If direct parse fails, try to extract a JSON array from the text
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const parsed = JSON.parse(arrayMatch[0]);
          if (Array.isArray(parsed)) people = parsed;
        } catch {}
      }
    }

    // ---------- Normalize phone numbers and filter junk ----------
    const normalizePhone = (phone) => {
      let cleaned = String(phone || '').replace(/[^\d+]/g, '');
      if (cleaned.startsWith('0')) cleaned = '+234' + cleaned.substring(1);
      else if (cleaned.startsWith('234') && !cleaned.startsWith('+')) cleaned = '+' + cleaned;
      if (cleaned === '+234' || cleaned.length < 10) cleaned = '';
      return cleaned;
    };

    const seen = new Set();
    const uniquePeople = [];
    for (const p of people) {
      const name = (p.name || '').trim();
      const phone = normalizePhone(p.phone);
      // Skip purely numeric names and headers
      if (!name || /^[0-9+\-\s]+$/.test(name)) continue;
      if (name.toLowerCase() === 'names' || name.toLowerCase() === 'phone number') continue;

      const key = `${name}|${phone}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniquePeople.push({ name, phone, confidence: 85 });
      }
      // Safety valve – never more than 50 people from a single scan
      if (uniquePeople.length >= 50) break;
    }

    console.log('ARIA extracted people:', uniquePeople.length);

    if (uniquePeople.length === 0) {
      return res.status(200).json({ status: 'failed', error: 'ARIA could not read any names. Please try a clearer photo.' });
    }

    // ---------- Save to database ----------
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
          [orgId, fullName, phone, person.confidence || 85]
        );
        const memberId = insertRes.rows[0].id;
        savedPeople.push(memberId);
        newMembersCount++;
        console.log(`ARIA inserted ${fullName} (${phone})`);
      } catch (insertErr) {
        console.error(`Insert error for ${fullName}:`, insertErr.message);
        // If phone already exists, reuse that ID
        if (phone) {
          const existing = await client.query(
            `SELECT id FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
            [orgId, phone]
          );
          if (existing.rows.length > 0) {
            savedPeople.push(existing.rows[0].id);
            await client.query(
              `UPDATE people SET first_name = $1, confidence = $2 WHERE id = $3`,
              [fullName, person.confidence || 85, existing.rows[0].id]
            );
          }
        }
      }
    }

    // ---------- Record attendance & timeline ----------
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
    });
  } catch (error) {
    console.error('ARIA vision scan error:', error);
    return res.status(200).json({ status: 'failed', error: error.message || 'ARIA encountered an issue' });
  }
}
