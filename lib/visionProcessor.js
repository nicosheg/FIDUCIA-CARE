// lib/visionProcessor.js – Full integration with state machine, provider, atomic commit

import pool from './db';
import { callVisionWithRetry } from './aiProvider';
import { validateScanOutput } from './scanValidation';
import { INTERNAL_STATES, dbStatusFromInternal, ariaMessageForState } from './scanState';
import { buildScanResult } from './scanResult';
import crypto from 'crypto';

async function updateJobState(client, jobId, state, progress, result, attemptCount, provider) {
  const status = dbStatusFromInternal(state);
  const now = new Date();
  const heartbeat = now;
  const fields = {
    status,
    progress: progress || null,
    heartbeat,
    last_progress_at: now,
    attempt_count: attemptCount || undefined,
    provider_used: provider || undefined,
    completed_at: state === INTERNAL_STATES.COMPLETED || state === INTERNAL_STATES.FAILED || state === INTERNAL_STATES.TIMED_OUT ? now : undefined,
    duration_ms: state === INTERNAL_STATES.COMPLETED || state === INTERNAL_STATES.FAILED ? Math.round((now - new Date(started_at)) / 1000) : undefined,
    result: result ? JSON.stringify(result) : undefined,
  };
  const setClause = Object.keys(fields).filter(k => fields[k] !== undefined).map((k, i) => `${k} = $${i+2}`).join(', ');
  const values = [jobId, ...Object.values(fields).filter(v => v !== undefined)];
  await client.query(`UPDATE scan_jobs SET ${setClause} WHERE id = $1`, values);
}

export async function processVisionJob(jobId, imageBase64, orgId, programName) {
  const startTime = Date.now();
  const client = await pool.connect();
  try {
    // Initial state: queued → analysing
    await updateJobState(client, jobId, INTERNAL_STATES.ANALYSING, 'enhancing', null, 0, null);

    // Compute image hash for idempotency
    const hash = crypto.createHash('sha256').update(imageBase64).digest('hex');
    await client.query(`UPDATE scan_jobs SET image_hash = $1 WHERE id = $2`, [hash, jobId]);

    // Check if same image already processed for this org
    const existing = await client.query(
      `SELECT id, result FROM scan_jobs WHERE organization_id = $1 AND image_hash = $2 AND status = 'complete' LIMIT 1`,
      [orgId, hash]
    );
    if (existing.rows.length > 0) {
      console.log('Duplicate image detected, returning previous result');
      await updateJobState(client, jobId, INTERNAL_STATES.COMPLETED, 'complete', existing.rows[0].result, 0, 'cache');
      return;
    }

    let data, providerUsed, attemptCount;
    try {
      // Call AI provider with retry
      const result = await callVisionWithRetry(imageBase64, (provider, attempt, delay) => {
        // Update state to retrying
        updateJobState(client, jobId, INTERNAL_STATES.RETRYING, 'retrying', { message: `ARIA is retrying (${attempt})` }, attempt, provider);
      });
      data = result.data;
      providerUsed = result.provider;
      attemptCount = result.attempt;
    } catch (err) {
      const errorMsg = err.message || 'Unknown error';
      await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', { error: errorMsg }, 0, null);
      return;
    }

    const rawContent = data.choices[0].message.content;
    console.log('AI raw (first 300):', rawContent?.substring(0, 300));

    // Update state to extracting/validating
    await updateJobState(client, jobId, INTERNAL_STATES.EXTRACTING, 'reading_handwriting', null, attemptCount, providerUsed);

    // Full validation
    const validation = await validateScanOutput(rawContent, orgId, programName, jobId);
    if (!validation.valid || validation.people.length === 0) {
      const error = validation.error || 'No valid people extracted';
      await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', { error }, attemptCount, providerUsed);
      return;
    }

    await updateJobState(client, jobId, INTERNAL_STATES.MATCHING, 'matching_community', null, attemptCount, providerUsed);

    // Atomic persistence: start transaction
    await client.query('BEGIN');

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

    const savedPeople = [];
    const matchedPeople = [];
    const newPeople = [];
    const needsReview = [];

    // 1. Process duplicates (update existing)
    for (const dup of validation.duplicates) {
      const existingId = dup.existing.id;
      // Update name if different
      if (dup.existing.first_name !== dup.incoming.name) {
        await client.query(`UPDATE people SET first_name = $1, last_scan_job_id = $2 WHERE id = $3`,
          [dup.incoming.name, jobId, existingId]);
      }
      // Mark attendance
      await client.query(
        `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (member_id, attendance_date) DO UPDATE SET present = true`,
        [existingId, today, sectionId]
      );
      // Timeline
      await client.query(
        `INSERT INTO timeline_events (person_id, organization_id, event_type, description, metadata)
         VALUES ($1, $2, 'attendance', 'Present at ' || $3, ('{"program": "' || $3 || '"}')::jsonb)`,
        [existingId, orgId, programName]
      );
      savedPeople.push(existingId);
      matchedPeople.push({ id: existingId, name: dup.existing.first_name });
    }

    // 2. Process needs_review (insert as quarantine with reason)
    for (const nr of validation.needsReview) {
      // We may optionally insert as a quarantine record
      // For now, we mark as needs review in the result, but we don't insert into people yet.
      // We'll store them in a separate table? For simplicity, we'll just record them in the result.
      needsReview.push(nr);
    }

    // 3. Insert new people
    for (const person of validation.people) {
      const type = person.type || 'visitor';
      const status = 'active';
      const insertRes = await client.query(
        `INSERT INTO people (organization_id, first_name, phone, type, status, confidence, source, created_by, last_scan_job_id)
         VALUES ($1, $2, $3, $4, $5, 85, 'scan', NULL, $6) RETURNING id`,
        [orgId, person.name, person.phone || null, type, status, jobId]
      );
      const pid = insertRes.rows[0].id;
      savedPeople.push(pid);
      newPeople.push({ id: pid, name: person.name, type });
      // Attendance
      await client.query(
        `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
         VALUES ($1, $2, true, $3)`,
        [pid, today, sectionId]
      );
      await client.query(
        `INSERT INTO timeline_events (person_id, organization_id, event_type, description, metadata)
         VALUES ($1, $2, 'attendance', 'Present at ' || $3, ('{"program": "' || $3 || '"}')::jsonb)`,
        [pid, orgId, programName]
      );
    }

    // Mark absent for active people not in savedPeople
    const allActive = await client.query(`SELECT id FROM people WHERE organization_id = $1 AND status = 'active'`, [orgId]);
    for (const row of allActive.rows) {
      if (!savedPeople.includes(row.id)) {
        await client.query(
          `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
           VALUES ($1, $2, false, $3)
           ON CONFLICT (member_id, attendance_date) DO NOTHING`,
          [row.id, today, sectionId]
        );
      }
    }

    await client.query('COMMIT');

    // Build canonical result
    const result = buildScanResult({
      scanId: jobId,
      orgId,
      extractedPeople: validation.people.map(p => ({ name: p.name, phone: p.phone })),
      matchedPeople,
      newPeople,
      needsReview,
      attendanceChanges: savedPeople.map(id => ({ personId: id, present: true })),
      warnings: [],
      providerUsed,
      durationMs: Date.now() - startTime,
      attemptCount,
      status: 'completed',
    });

    await updateJobState(client, jobId, INTERNAL_STATES.COMPLETED, 'complete', result, attemptCount, providerUsed);

    console.log(`Job ${jobId} completed in ${(Date.now() - startTime)/1000}s`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Job failed:', err.message, err.stack);
    const error = err.message || 'Unknown error';
    await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', { error }, 0, null);
  } finally {
    client.release();
  }
}
