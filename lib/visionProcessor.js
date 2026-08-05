// lib/visionProcessor.js
import pool from './db';
import { enqueueVisionJob } from './visionQueue';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ---------- Helpers (identical to vision-scan) ----------
function extractPeopleFromText(rawContent) { /* same as before */ }
function normalizePhone(phone) { /* same as before */ }
function estimateConfidence(name, phone) { /* same as before */ }
async function detectDuplicates(client, orgId, people) { /* same as before */ }

// ---------- Main processor ----------
export async function processVisionJob(jobId, imageBase64, orgId, programName) {
  const client = await pool.connect();
  try {
    // Mark job as processing
    await client.query(`UPDATE scan_jobs SET status = 'processing' WHERE id = $1`, [jobId]);

    // The vision task (will be queued)
    const visionTask = async () => {
      const systemPrompt = `You are ARIA, an intelligent assistant. You receive a photo of a church attendance register. Extract every person's name and phone number. Return ONLY a valid JSON array of objects with fields "name" and "phone". Do not include any reasoning, analysis, explanation, or markdown. Just the JSON array. No other text.`;

      // Add an explicit user instruction to suppress reasoning
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
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
                { type: 'text', text: 'Output the JSON array immediately. Do not explain.' },
              ],
            },
          ],
          temperature: 0,
          max_tokens: 2000,           // prevent endless loops
          stream: false,
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

    // Execute with retry
    let people = [];
    try {
      let data = await enqueueVisionJob(visionTask);
      let rawContent = data.choices[0].message.content;
      console.log('ARIA raw (first 200):', rawContent.substring(0, 200));
      people = extractPeopleFromText(rawContent);

      if (!people || people.length === 0) {
        // Retry once
        data = await enqueueVisionJob(visionTask);
        rawContent = data.choices[0].message.content;
        people = extractPeopleFromText(rawContent);
      }
    } catch (err) {
      await client.query(`UPDATE scan_jobs SET status = 'failed', result = $2 WHERE id = $1`,
        [jobId, JSON.stringify({ error: err.message })]);
      return;
    }

    // Filter, normalize, compute confidence
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
        const confidence = estimateConfidence(name, phone);
        uniquePeople.push({ name, phone, confidence, needs_review: confidence < 70 });
      }
      if (uniquePeople.length >= 50) break;
    }

    // Insert into database
    const savedPeople = [];
    let newMembersCount = 0;
    for (const person of uniquePeople) {
      const fullName = person.name;
      const phone = person.phone;
      try {
        const insertRes = await client.query(
          `INSERT INTO people (organization_id, first_name, last_name, phone, type, status, confidence)
           VALUES ($1, $2, '', $3, 'visitor', 'active', $4) RETURNING id`,
          [orgId, fullName, phone, person.confidence]
        );
        savedPeople.push(insertRes.rows[0].id);
        newMembersCount++;
      } catch (insertErr) {
        if (phone) {
          const existing = await client.query(
            `SELECT id FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
            [orgId, phone]
          );
          if (existing.rows.length > 0) {
            savedPeople.push(existing.rows[0].id);
            await client.query(`UPDATE people SET first_name = $1, confidence = $2 WHERE id = $3`,
              [fullName, person.confidence, existing.rows[0].id]);
          }
        }
      }
    }

    // Duplicate detection
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

    // Mark absentees
    const allActive = await client.query(
      `SELECT id FROM people WHERE organization_id = $1 AND status = 'active'`, [orgId]
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

    // Save final result
    const result = {
      status: 'ok',
      present_count: savedPeople.length,
      absent_count: allActiveIds.length - savedPeople.length,
      new_members: newMembersCount,
      people: uniquePeople,
      duplicates,
      needs_review: uniquePeople.filter(p => p.needs_review).length,
    };
    await client.query(
      `UPDATE scan_jobs SET status = 'complete', result = $2 WHERE id = $1`,
      [jobId, JSON.stringify(result)]
    );
  } catch (error) {
    console.error('Background scan error:', error);
    await client.query(
      `UPDATE scan_jobs SET status = 'failed', result = $2 WHERE id = $1`,
      [jobId, JSON.stringify({ error: error.message })]
    );
  } finally {
    client.release();
  }
  }
