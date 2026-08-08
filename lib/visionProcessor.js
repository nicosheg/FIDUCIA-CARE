import pool from './db';
import { callVisionWithRetry, getFriendlyError } from './aiProvider';
import { validateScanOutput } from './scanValidation';

// -------- Update existing person with attendance and timeline --------
async function updateExistingPerson(client, personId, name, phone, programName, today, sectionId) {
  // Update name if changed
  const existing = await client.query(`SELECT first_name FROM people WHERE id = $1`, [personId]);
  if (existing.rows.length > 0 && existing.rows[0].first_name !== name) {
    await client.query(`UPDATE people SET first_name = $1 WHERE id = $2`, [name, personId]);
  }
  // Mark attendance for today
  await client.query(
    `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
     VALUES ($1, $2, true, $3)
     ON CONFLICT (member_id, attendance_date) DO UPDATE SET present = true`,
    [personId, today, sectionId]
  );
  // Add timeline event
  await client.query(
    `INSERT INTO timeline_events (person_id, organization_id, event_type, description, metadata)
     VALUES ($1, 'demo-org', 'attendance', 'Present at ' || $2, ('{"program": "' || $2 || '"}')::jsonb)`,
    [personId, programName]
  );
}

// -------- Main processor --------
export async function processVisionJob(jobId, imageBase64, orgId, programName) {
  const startTime = Date.now();
  const client = await pool.connect();
  try {
    await client.query(`UPDATE scan_jobs SET progress = 'enhancing', status = 'processing' WHERE id = $1`, [jobId]);

    let data;
    try {
      data = await callVisionWithRetry(imageBase64, (attempt, delay) => {
        // Update status to 'retrying' during backoff
        pool.query(
          `UPDATE scan_jobs SET status = 'retrying', progress = 'retrying',
           result = $2 WHERE id = $1`,
          [jobId, JSON.stringify({ message: 'ARIA is taking a little longer than usual…' })]
        ).catch(err => console.error('Failed to update retry status:', err));
      });
    } catch (err) {
      const friendly = getFriendlyError(err);
      console.error('Vision failed:', err.message);
      await client.query(
        `UPDATE scan_jobs SET status = 'failed', progress = 'failed',
         result = $2 WHERE id = $1`,
        [jobId, JSON.stringify({ error: friendly })]
      );
      return;
    }

    const rawContent = data.choices[0].message.content;
    console.log('ARIA raw (first 300 chars):', rawContent?.substring(0, 300));

    // Full validation (with duplicate detection)
    const validationResult = await validateScanOutput(rawContent, orgId, programName, jobId);

    if (!validationResult.valid || validationResult.people.length === 0) {
      const errorMsg = validationResult.error || 'ARIA could not extract valid people. Please try a clearer photo.';
      await client.query(
        `UPDATE scan_jobs SET status = 'failed', progress = 'failed',
         result = $2 WHERE id = $1`,
        [jobId, JSON.stringify({ error: errorMsg })]
      );
      return;
    }

    await client.query(`UPDATE scan_jobs SET progress = 'matching_community' WHERE id = $1`, [jobId]);

    const today = new Date().toISOString().slice(0, 10);
    // Get or create session
    let sessionRes = await client.query(
      `SELECT id FROM sessions WHERE church_id = $1 AND name = $2 AND created_at::date = $3`,
      [orgId, programName, today]
    );
    let sessionId;
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

    // Process each validated person: insert new or update existing
    const savedPeople = [];
    let newMembersCount = 0;
    let updatedCount = 0;
    let duplicateCount = validationResult.duplicates.length;

    // First, handle duplicates (update existing)
    for (const dup of validationResult.duplicates) {
      const existingId = dup.existing.id;
      await updateExistingPerson(client, existingId, dup.incoming.name, dup.incoming.phone, programName, today, sectionId);
      savedPeople.push(existingId);
      updatedCount++;
    }

    // Then handle new people
    for (const person of validationResult.people) {
      // Determine type: if person has existing type from validation, use it; else default based on stage
      let type = person.type || 'visitor';
      if (type === 'visitor' && (person.relationship_stage === 'regular' || person.relationship_stage === 'returning')) {
        type = 'member';
      }
      const status = 'active';

      // Insert new person
      try {
        const insertRes = await client.query(
          `INSERT INTO people (organization_id, first_name, phone, type, status, confidence, source, created_by, last_scan_job_id)
           VALUES ($1, $2, $3, $4, $5, 85, 'scan', NULL, $6) RETURNING id`,
          [orgId, person.name, person.phone || null, type, status, jobId]
        );
        const personId = insertRes.rows[0].id;
        savedPeople.push(personId);
        newMembersCount++;
        // Mark attendance
        await client.query(
          `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
           VALUES ($1, $2, true, $3)`,
          [personId, today, sectionId]
        );
        await client.query(
          `INSERT INTO timeline_events (person_id, organization_id, event_type, description, metadata)
           VALUES ($1, $2, 'attendance', 'Present at ' || $3, ('{"program": "' || $3 || '"}')::jsonb)`,
          [personId, orgId, programName]
        );
      } catch (insertErr) {
        // If conflict (phone unique), fetch existing and update
        if (person.phone) {
          const existing = await client.query(
            `SELECT id FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
            [orgId, person.phone]
          );
          if (existing.rows.length > 0) {
            const existingId = existing.rows[0].id;
            await updateExistingPerson(client, existingId, person.name, person.phone, programName, today, sectionId);
            savedPeople.push(existingId);
            updatedCount++;
          }
        }
      }
    }

    // Mark absent for everyone else (only if they are active)
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

    // Build result with clear feedback
    const result = {
      status: 'ok',
      present_count: savedPeople.length,
      absent_count: allActiveIds.length - savedPeople.length,
      new_members: newMembersCount,
      updated: updatedCount,
      duplicates: validationResult.duplicates.map(d => ({
        name: d.incoming.name,
        phone: d.incoming.phone,
        existing: { id: d.existing.id, name: d.existing.first_name },
        confidence: d.confidence,
      })),
      needs_review: validationResult.needsReview.length,
      total_extracted: validationResult.total_extracted,
      total_valid: validationResult.total_valid,
      message: `ARIA recognised ${savedPeople.length} people, ${newMembersCount} new, ${updatedCount} familiar faces updated.`
    };

    await client.query(
      `UPDATE scan_jobs SET status = 'complete', progress = 'complete', result = $2 WHERE id = $1`,
      [jobId, JSON.stringify(result)]
    );
  } catch (error) {
    console.error('Job failed:', error.message, error.stack);
    const friendly = getFriendlyError(error);
    await client.query(
      `UPDATE scan_jobs SET status = 'failed', progress = 'failed', result = $2 WHERE id = $1`,
      [jobId, JSON.stringify({ error: friendly })]
    );
  } finally {
    client.release();
  }
                                }
