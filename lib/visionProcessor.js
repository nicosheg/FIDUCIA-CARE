import pool from './db';
import { validateScanOutput } from './scanValidation';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

    // ---------- RUN VALIDATION PIPELINE ----------
    // This replaces ALL previous extraction/fallback/insertion logic
    const validationResult = await validateScanOutput(rawContent, orgId, programName);

    // If no valid people extracted, fail gracefully
    if (!validationResult.valid || validationResult.people.length === 0) {
      console.log('No valid people extracted. Validation result:', validationResult);
      await client.query(
        `UPDATE scan_jobs SET status = 'failed', progress = 'failed',
         result = $2 WHERE id = $1`,
        [jobId, JSON.stringify({
          error: 'ARIA could not extract valid people from this register. Please try a clearer photo.',
          details: validationResult
        })]
      );
      return;
    }

    // Log duplicates and needs-review counts for monitoring
    if (validationResult.duplicates.length > 0) {
      console.log(`Found ${validationResult.duplicates.length} duplicates that will be skipped.`);
    }
    if (validationResult.needsReview.length > 0) {
      console.log(`Found ${validationResult.needsReview.length} people that need review.`);
    }

    await client.query(`UPDATE scan_jobs SET progress = 'matching_community' WHERE id = $1`, [jobId]);

    // ---------- Insert validated people ----------
    const savedPeople = [];
    let newMembersCount = 0;
    let updateCount = 0;

    for (const person of validationResult.people) {
      const fullName = person.name;
      const phone = person.phone;
      const relationshipStage = person.relationship_stage || 'new_visitor';

      // Determine type and status based on relationship stage
      let type = 'visitor';
      let status = 'active';
      if (relationshipStage === 'regular' || relationshipStage === 'returning' || relationshipStage === 'familiar_face') {
        type = 'member';
      }

      // Check if person already exists by phone (extra safety – validation should already catch this)
      let existingId = null;
      if (phone) {
        const existingRes = await client.query(
          `SELECT id, first_name, type, status FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
          [orgId, phone]
        );
        if (existingRes.rows.length > 0) {
          existingId = existingRes.rows[0].id;
          // Update name if changed
          if (existingRes.rows[0].first_name !== fullName) {
            await client.query(`UPDATE people SET first_name = $1 WHERE id = $2`, [fullName, existingId]);
            updateCount++;
          }
          // Preserve existing type/status – don't downgrade to visitor
          // Only update if current is 'visitor' and new is 'member'
          if (existingRes.rows[0].type === 'visitor' && type === 'member') {
            await client.query(`UPDATE people SET type = $1, status = $2 WHERE id = $3`, [type, status, existingId]);
          }
          savedPeople.push(existingId);
          continue;
        }
      }

      // If no phone, check by name (fuzzy) – but validation already handles this
      // If we reach here, it's a new person
      try {
        const insertRes = await client.query(
          `INSERT INTO people (organization_id, first_name, phone, type, status, confidence)
           VALUES ($1, $2, $3, $4, $5, 85)
           RETURNING id`,
          [orgId, fullName, phone || null, type, status]
        );
        savedPeople.push(insertRes.rows[0].id);
        newMembersCount++;
      } catch (insertErr) {
        // If duplicate conflict (should be rare), fetch existing
        console.error('Insert error, attempting recovery:', insertErr.message);
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

    // Save duplicates info into the job result for frontend display
    const duplicateIds = validationResult.duplicates.map(d => d.existing?.id).filter(Boolean);
    const needsReviewIds = validationResult.needsReview.map(d => d.existing?.id).filter(Boolean);

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

    // Mark attendance for saved people
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

    // Mark absent for everyone else
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

    // Build result with validation stats
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
