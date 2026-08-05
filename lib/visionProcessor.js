import pool from './db';
import { enqueueVisionJob } from './visionQueue';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ---------- Helpers (same as before, but now also parse plain text) ----------

function extractPeopleFromJSON(raw) {
  if (!raw) return null;
  let text = raw.replace(/```json|```/g, '').trim();
  if (text.includes('</think>')) text = text.split('</think>')[1].trim();
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try { const parsed = JSON.parse(arrayMatch[0]); if (Array.isArray(parsed)) return parsed; } catch {}
    const repaired = arrayMatch[0].replace(/,\s*]/g, ']').replace(/,\s*}/g, '}')
      .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
    try { const parsed = JSON.parse(repaired); if (Array.isArray(parsed)) return parsed; } catch {}
  }
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { const obj = JSON.parse(objMatch[0]); if (obj.name) return [obj]; } catch {}
  }
  return null;
}

function fallbackExtract(rawText) {
  const lines = rawText.split('\n').filter(Boolean);
  const people = [];
  for (const line of lines) {
    const phoneMatch = line.match(/(.*?)([0-9+\-\s]{8,})$/);
    const name = phoneMatch ? phoneMatch[1].trim() : line.trim();
    const rawPhone = phoneMatch ? phoneMatch[2].replace(/\s/g, '') : '';
    if (name.length >= 2 && /[a-zA-Z]/.test(name)) {
      let phone = '';
      if (rawPhone) {
        let cleaned = rawPhone.replace(/[^\d+]/g, '');
        if (cleaned.startsWith('0')) cleaned = '+234' + cleaned.substring(1);
        else if (cleaned.startsWith('234') && !cleaned.startsWith('+')) cleaned = '+' + cleaned;
        if (cleaned.length >= 10) phone = cleaned;
      }
      people.push({ name, phone, needs_review: true });
    }
  }
  return people;
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
  if (phone) {
    const existing = await client.query(
      `SELECT id, created_at FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
      [orgId, phone]
    );
    if (existing.rows.length > 0) {
      const person = existing.rows[0];
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
  if (name) {
    const similar = await client.query(
      `SELECT id FROM people WHERE organization_id = $1 AND first_name ILIKE $2 LIMIT 1`,
      [orgId, `%${name}%`]
    );
    if (similar.rows.length > 0) return 'familiar_face';
  }
  return 'new_visitor';
}

// ---------- Robust retry with exponential backoff ----------

async function callVisionWithRetry(jobId, imageBase64) {
  const backoffDelays = [5, 15, 30, 60, 120]; // seconds
  let lastError = null;

  for (let attempt = 0; attempt < backoffDelays.length; attempt++) {
    const delay = backoffDelays[attempt];
    try {
      // Update retry count in database
      await pool.query(`UPDATE scan_jobs SET retry_count = $1 WHERE id = $2`, [attempt, jobId]);

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
          temperature: 0,
          max_tokens: 2000,
          stream: false,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`Vision API success on attempt ${attempt + 1}`);
        return data;
      }

      // Parse error
      const err = await response.json();
      const msg = err.error?.message || 'Groq error';
      const isRateLimit = response.status === 429 || msg.includes('Please try again in');

      if (isRateLimit) {
        console.log(`Rate limit hit (attempt ${attempt + 1}), waiting ${delay}s before retry`);
        // Update job status to 'retrying'
        await pool.query(
          `UPDATE scan_jobs SET status = 'retrying', progress = 'retrying',
           result = $2 WHERE id = $1`,
          [jobId, JSON.stringify({ message: `ARIA is busy analysing your register. This may take a little longer than usual.` })]
        );
        await new Promise(r => setTimeout(r, delay * 1000));
        lastError = { rateLimit: true, message: msg };
        continue;
      }

      // Non‑rate‑limit error – throw immediately
      throw new Error(msg);
    } catch (error) {
      if (error.rateLimit) {
        lastError = error;
        continue;  // already handled above
      }
      // Other network errors – wait the backoff delay and retry
      console.error(`Attempt ${attempt + 1} failed:`, error.message);
      lastError = error;
      if (attempt < backoffDelays.length - 1) {
        await new Promise(r => setTimeout(r, delay * 1000));
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error('Vision API failed after multiple retries');
}

// ---------- Main processor ----------

export async function processVisionJob(jobId, imageBase64, orgId, programName) {
  const startTime = Date.now();
  const client = await pool.connect();
  try {
    await client.query(`UPDATE scan_jobs SET progress = 'enhancing', status = 'processing' WHERE id = $1`, [jobId]);

    // Call vision with retry
    let data;
    try {
      data = await callVisionWithRetry(jobId, imageBase64);
    } catch (err) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`Vision job ${jobId} failed after retries (${totalTime}s)`, err.message);
      await client.query(
        `UPDATE scan_jobs SET status = 'failed', progress = 'failed',
         result = $2 WHERE id = $1`,
        [jobId, JSON.stringify({ error: err.message || 'ARIA could not read the register' })]
      );
      return;
    }

    const rawContent = data.choices[0].message.content;
    console.log('ARIA raw (first 300 chars):', rawContent?.substring(0, 300));

    // 1) Try structured JSON extraction
    let people = extractPeopleFromJSON(rawContent);

    // 2) Fallback to plain‑text parser
    if (!people || people.length === 0) {
      console.log('Structured extraction failed, using fallback parser');
      people = fallbackExtract(rawContent);
      people.forEach(p => { p.needs_review = true; p.relationship_stage = 'new_visitor'; });
    }

    if (people.length === 0) {
      await client.query(
        `UPDATE scan_jobs SET status = 'failed', progress = 'failed',
         result = $2 WHERE id = $1`,
        [jobId, JSON.stringify({ error: 'ARIA could not read any names. Please try a clearer photo.' })]
      );
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
        if (!p.relationship_stage) {
          p.relationship_stage = await determineRelationshipStage(client, orgId, name, phone);
        }
        if (!p.needs_review) p.needs_review = (p.relationship_stage === 'new_visitor');
        uniquePeople.push({ name, phone, relationship_stage: p.relationship_stage, needs_review: p.needs_review });
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

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Job ${jobId} completed in ${totalTime}s`);

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
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`Job ${jobId} failed unexpectedly (${totalTime}s):`, error.message);
    await client.query(
      `UPDATE scan_jobs SET status = 'failed', progress = 'failed', result = $2 WHERE id = $1`,
      [jobId, JSON.stringify({ error: error.message })]
    );
  } finally {
    client.release();
  }
        }
