import pool from './db';
import { validateScanOutput, isValidPersonArray } from './scanValidation';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ---------- Call Vision (with optional stricter prompt) ----------
async function callVision(imageBase64, isRetry = false) {
  const systemPrompt = isRetry
    ? `You are ARIA. Extract every person's name and phone number from this church attendance register photo. Return ONLY a raw JSON array of { "name": "...", "phone": "..." }. NO markdown, NO numbering, NO bullet points, NO commentary.`
    : `You are ARIA. Extract every person's name and phone number from this church attendance register photo. Return ONLY a JSON array of { "name": "...", "phone": "..." }. No other text.`;

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

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Groq API error');
  }
  return response.json();
}

// ---------- Robust retry with exponential backoff ----------
async function callVisionWithRetry(jobId, imageBase64, orgId) {
  const backoffDelays = [5, 15, 30, 60, 120];
  let lastError = null;

  for (let attempt = 0; attempt < backoffDelays.length; attempt++) {
    const delay = backoffDelays[attempt];
    try {
      await pool.query(`UPDATE scan_jobs SET retry_count = $1 WHERE id = $2`, [attempt, jobId]);

      // First attempt: normal prompt
      let data = await callVision(imageBase64, false);
      const rawContent = data.choices[0].message.content;

      // LIGHTWEIGHT check: is this parseable JSON with person-shaped objects? (NO DB)
      if (isValidPersonArray(rawContent)) {
        return data; // Success
      }

      // If lightweight check failed, retry ONCE with stricter prompt
      console.log('JSON validation failed on attempt 1, retrying with stricter prompt...');
      data = await callVision(imageBase64, true);
      const rawContentRetry = data.choices[0].message.content;

      // Lightweight check again
      if (isValidPersonArray(rawContentRetry)) {
        return data; // Success on retry
      }

      // Both attempts failed to produce valid JSON
      throw new Error('ARIA could not extract valid data. Please try a clearer photo.');

    } catch (error) {
      const isRateLimit = error.message?.includes('Please try again in') || error.message?.includes('429');
      if (isRateLimit) {
        console.log(`Rate limit hit (attempt ${attempt + 1}), waiting ${delay}s`);
        await pool.query(
          `UPDATE scan_jobs SET status = 'retrying', progress = 'retrying',
           result = $2 WHERE id = $1`,
          [jobId, JSON.stringify({ message: 'ARIA is busy. This may take a little longer...' })]
        );
        await new Promise(r => setTimeout(r, delay * 1000));
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('Vision API failed after multiple retries');
}

// ---------- Main processor ----------
export async function processVisionJob(jobId, imageBase64, orgId, programName) {
  const startTime = Date.now();
  const client = await pool.connect();
  try {
    await client.query(`UPDATE scan_jobs SET progress = 'enhancing', status = 'processing' WHERE id = $1`, [jobId]);

    let data;
    try {
      data = await callVisionWithRetry(jobId, imageBase64, orgId);
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

    // ---------- FULL VALIDATION (with DB duplicate checks) ----------
    const validationResult = await validateScanOutput(rawContent, orgId, programName);

    // If validation fails, fail the job
    if (!validationResult.valid || validationResult.people.length === 0) {
      console.log('No valid people extracted. Validation result:', validationResult);
      await client.query(
        `UPDATE scan_jobs SET status = 'failed', progress = 'failed',
         result = $2 WHERE id = $1`,
        [jobId, JSON.stringify({
          error: validationResult.error || 'ARIA could not extract valid people. Please try a clearer photo.'
        })]
      );
      return;
    }

    // ---------- Insert/Update validated people ----------
    const savedPeople = [];
    let newMembersCount = 0;
    let updateCount = 0;

    for (const person of validationResult.people) {
      const fullName = person.name;
      const phone = person.phone;
      const relationshipStage = person.relationship_stage || 'new_visitor';

      let type = (relationshipStage === 'regular' || relationshipStage === 'returning' || relationshipStage === 'familiar_face')
        ? 'member' : 'visitor';
      let status = 'active';

      // Check existing by phone (should be caught by validation, but safe)
      let existingId = null;
      if (phone) {
        const existingRes = await client.query(
          `SELECT id, first_name, type, status FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
          [orgId, phone]
        );
        if (existingRes.rows.length > 0) {
          existingId = existingRes.rows[0].id;
          if (existingRes.rows[0].first_name !== fullName) {
            await client.query(`UPDATE people SET first_name = $1 WHERE id = $2`, [fullName, existingId]);
            updateCount++;
          }
          if (existingRes.rows[0].type === 'visitor' && type === 'member') {
            await client.query(`UPDATE people SET type = $1, status = $2 WHERE id = $3`, [type, status, existingId]);
          }
          savedPeople.push(existingId);
          continue;
        }
      }

      // New person
      try {
        const insertRes = await client.query(
          `INSERT INTO people (organization_id, first_name, phone, type, status, confidence)
           VALUES ($1, $2, $3, $4, $5, 85) RETURNING id`,
          [orgId, fullName, phone || null, type, status]
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
            await client.query(`UPDATE people SET first_name = $1, type = $2, status = $3 WHERE id = $4`,
              [fullName, type, status, existing.rows[0].id]
            );
          }
        }
      }
    }

    // ---------- Attendance & Timeline ----------
    await client.query(`UPDATE scan_jobs SET progress = 'building_memory' WHERE id = $1`, [jobId]);

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
      updated: updateCount,
      people: validationResult.people,
      duplicates: validationResult.duplicates.map(d => ({
        name: d.name,
        phone: d.phone,
        existing: d.existing ? { id: d.existing.id, name: d.existing.first_name } : null,
        confidence: d.confidence
      })),
      needs_review: validationResult.needsReview.length,
      total_extracted: validationResult.total_extracted,
      total_valid: validationResult.total_valid,
    };

    await client.query(
      `UPDATE scan_jobs SET status = 'complete', progress = 'complete', result = $2 WHERE id = $1`,
      [jobId, JSON.stringify(result)]
    );
  } catch (error) {
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`Job ${jobId} failed unexpectedly (${totalTime}s):`, error.message, error.stack);
    await client.query(
      `UPDATE scan_jobs SET status = 'failed', progress = 'failed', result = $2 WHERE id = $1`,
      [jobId, JSON.stringify({ error: error.message || 'Unexpected error' })]
    );
  } finally {
    client.release();
  }
      }
