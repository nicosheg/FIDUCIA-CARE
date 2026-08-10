// lib/visionProcessor.js
import pool from './db';
import { callVisionWithRetry } from './aiProvider';
import { validateScanOutput, MAX_PEOPLE_PER_SCAN } from './scanValidation';
import { INTERNAL_STATES, dbStatusFromInternal } from './scanState';
import crypto from 'crypto';

async function updateJobState(client, jobId, state, progress, result, attemptCount, provider, startTime) {
  const status = dbStatusFromInternal(state);
  const now = new Date();
  const fields = {
    status,
    progress: progress || null,
    heartbeat: now,
    last_progress_at: now,
    attempt_count: attemptCount || undefined,
    provider_used: provider || undefined,
    completed_at: (state === INTERNAL_STATES.COMPLETED || state === INTERNAL_STATES.FAILED || state === INTERNAL_STATES.TIMED_OUT) ? now : undefined,
    duration_ms: (state === INTERNAL_STATES.COMPLETED || state === INTERNAL_STATES.FAILED) ? Math.round((now - startTime)) : undefined,
    result: result ? JSON.stringify(result) : undefined,
  };
  const setClause = Object.keys(fields).filter(k => fields[k] !== undefined).map((k, i) => `${k} = $${i+2}`).join(', ');
  const values = [jobId, ...Object.values(fields).filter(v => v !== undefined)];
  await client.query(`UPDATE scan_jobs SET ${setClause} WHERE id = $1`, values);
}

function createError(stage, code, message, userMessage, details = null) {
  return { error: { stage, code, message, userMessage, details } };
}

export async function processVisionJob(jobId, imageBase64, orgId, programName, options = {}) {
  const { evaluation = false, registerMode = 'complete' } = options;
  const startTime = Date.now();
  const client = await pool.connect();
  let requestId = null;

  try {
    if (!evaluation) {
      await updateJobState(client, jobId, INTERNAL_STATES.ANALYSING, 'enhancing', null, 0, null, startTime);
    }

    const hash = crypto.createHash('sha256').update(imageBase64).digest('hex');
    if (!evaluation) {
      await client.query(`UPDATE scan_jobs SET image_hash = $1 WHERE id = $2`, [hash, jobId]);
    }

    // Idempotency check
    if (!evaluation) {
      const existing = await client.query(
        `SELECT id, result FROM scan_jobs WHERE organization_id = $1 AND image_hash = $2 AND status = 'complete' LIMIT 1`,
        [orgId, hash]
      );
      if (existing.rows.length > 0) {
        console.log('Duplicate image detected, returning previous result');
        await updateJobState(client, jobId, INTERNAL_STATES.COMPLETED, 'complete', existing.rows[0].result, 0, 'cache', startTime);
        return existing.rows[0].result;
      }
    }

    let data, providerUsed, attemptCount, modelKey;
    try {
      const result = await callVisionWithRetry(imageBase64, (attempt, delay) => {
        if (!evaluation) {
          updateJobState(client, jobId, INTERNAL_STATES.RETRYING, 'retrying', { message: `ARIA is retrying (${attempt})` }, attempt, 'Groq', startTime);
        }
      }, {
        organization_id: orgId,
        job_id: jobId,
        purpose: 'scan',
        prompt_version: 'v2',
        evaluation,
      });
      data = result.data;
      providerUsed = result.provider;
      attemptCount = result.attempt;
      requestId = result.requestId;
      modelKey = result.modelKey;
    } catch (err) {
      // AI provider error
      const friendly = err.message || 'ARIA could not complete the scan.';
      const errorObj = createError(
        'ai_request',
        'AI_PROVIDER_ERROR',
        err.message || 'Unknown provider error',
        'ARIA could not process the image. Please try again.',
        err.stack ? err.stack.substring(0, 200) : null
      );
      if (!evaluation) {
        await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', errorObj, 0, null, startTime);
        console.error(`Scan job ${jobId} failed at AI request stage:`, err.message);
      }
      return { error: errorObj };
    }

    const rawContent = data.choices[0].message.content;
    console.log('AI raw (first 300):', rawContent?.substring(0, 300));

    if (!evaluation) {
      await updateJobState(client, jobId, INTERNAL_STATES.EXTRACTING, 'reading_handwriting', null, attemptCount, providerUsed, startTime);
    }

    let validation;
    try {
      validation = await validateScanOutput(rawContent, orgId, programName, jobId, { evaluation });
    } catch (err) {
      // Validation error (e.g., corrupted data, parsing failure)
      const errorObj = createError(
        'validation',
        'VALIDATION_ERROR',
        err.message || 'Validation failed',
        'ARIA could not understand the extracted data. Please try a clearer image.',
        err.stack ? err.stack.substring(0, 200) : null
      );
      if (!evaluation) {
        await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', errorObj, attemptCount, providerUsed, startTime);
        console.error(`Scan job ${jobId} failed at validation stage:`, err.message);
      }
      return { error: errorObj };
    }

    // Update metrics only in production
    if (requestId && !evaluation) {
      await updateExtractionMetrics(
        requestId,
        validation.total_extracted || 0,
        validation.total_valid || 0,
        validation.needsReview?.length || 0
      );
    }

    if (!validation.valid) {
      // Validation returned invalid (e.g., non-array response)
      const errorObj = createError(
        'parse_json',
        'INVALID_AI_RESPONSE',
        validation.error || 'Invalid JSON structure',
        'ARIA could not read the register clearly. Please try again with a clearer photo.',
        null
      );
      if (!evaluation) {
        await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', errorObj, attemptCount, providerUsed, startTime);
        console.error(`Scan job ${jobId} failed at parse stage:`, validation.error);
      }
      return { error: errorObj };
    }

    // ---- DEFENSE-IN-DEPTH: Ensure validated people count does not exceed limit ----
    const validatedCount = validation.people?.length || 0;
    if (validatedCount > MAX_PEOPLE_PER_SCAN) {
      const errorObj = createError(
        'validation',
        'TOO_MANY_PEOPLE',
        `Validation produced ${validatedCount} people, exceeding limit of ${MAX_PEOPLE_PER_SCAN}.`,
        'Too many people extracted. Please ensure the register is a single page.',
        null
      );
      if (!evaluation) {
        await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', errorObj, attemptCount, providerUsed, startTime);
        console.error(`Scan job ${jobId} failed: too many people (${validatedCount})`);
      }
      return { error: errorObj };
    }

    // ---- Zero-person case ----
    if (validation.people.length === 0 && validation.duplicates.length === 0 && validation.needsReview.length === 0) {
      const result = {
        status: 'ok',
        present_count: 0,
        absent_count: 0,
        new_members: 0,
        updated: 0,
        people: [],
        duplicates: [],
        needs_review: [],
        rejected: validation.rejected || [],
        total_extracted: validation.total_extracted,
        total_valid: 0,
        summary: 'ARIA read the register but found no people. Nothing was added.',
      };
      if (!evaluation) {
        await updateJobState(client, jobId, INTERNAL_STATES.COMPLETED, 'complete', result, attemptCount, providerUsed, startTime);
      }
      return result;
    }

    // ---- Evaluation mode: stop here ----
    if (evaluation) {
      return {
        status: 'evaluation',
        people: validation.people,
        duplicates: validation.duplicates,
        needs_review: validation.needsReview,
        rejected: validation.rejected,
        total_extracted: validation.total_extracted,
        total_valid: validation.total_valid,
      };
    }

    // ---- PRODUCTION PERSISTENCE ----
    await updateJobState(client, jobId, INTERNAL_STATES.VALIDATING, 'validating', null, attemptCount, providerUsed, startTime);
    await updateJobState(client, jobId, INTERNAL_STATES.MATCHING, 'matching_community', null, attemptCount, providerUsed, startTime);

    await client.query('BEGIN');

    const today = new Date().toISOString().slice(0, 10);

    // Concurrent-safe session upsert
    const sessionResult = await client.query(
      `INSERT INTO sessions (church_id, name, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (church_id, name, session_date)
       DO UPDATE SET status = sessions.status
       RETURNING id`,
      [orgId, programName]
    );
    const sessionId = sessionResult.rows[0].id;

    const sectionRes = await client.query(
      `SELECT id FROM session_sections WHERE session_id = $1 AND name = 'All'`, [sessionId]
    );
    let sectionId;
    if (sectionRes.rows.length === 0) {
      const newSection = await client.query(
        `INSERT INTO session_sections (session_id, name) VALUES ($1, 'All') RETURNING id`,
        [sessionId]
      );
      sectionId = newSection.rows[0].id;
    } else {
      sectionId = sectionRes.rows[0].id;
    }

    const savedPeople = [];
    const matchedPeople = [];
    const newPeople = [];
    const needsReview = [];

    // Process duplicates: update existing
    for (const dup of validation.duplicates) {
      const existingId = dup.existing.id;
      if (dup.existing.first_name !== dup.incoming.name) {
        await client.query(`UPDATE people SET first_name = $1, last_scan_job_id = $2 WHERE id = $3`,
          [dup.incoming.name, jobId, existingId]);
      }
      await client.query(
        `INSERT INTO attendance_records (session_id, member_id, present, session_section_id)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (session_id, member_id) DO UPDATE SET present = true`,
        [sessionId, existingId, sectionId]
      );
      await client.query(
        `INSERT INTO timeline_events (person_id, organization_id, event_type, description, metadata)
         VALUES ($1, $2, 'attendance', 'Present at ' || $3, jsonb_build_object('program', $3))`,
        [existingId, orgId, programName]
      );
      savedPeople.push(existingId);
      matchedPeople.push({ id: existingId, name: dup.existing.first_name });
    }

    // Needs Review: store in result only (not in people yet)
    for (const nr of validation.needsReview) {
      needsReview.push(nr);
    }

    // Insert new confident people (with safe conflict handling)
    for (const person of validation.people) {
      let type = 'visitor';
      if (person.relationship_stage === 'regular' || person.relationship_stage === 'returning' || person.relationship_stage === 'familiar_face') {
        type = 'member';
      }

      if (!person.phone) {
        const insertRes = await client.query(
          `INSERT INTO people (organization_id, first_name, phone, type, status, confidence, source, created_by, last_scan_job_id)
           VALUES ($1, $2, NULL, $3, $4, $5, 'scan', NULL, $6)
           RETURNING id`,
          [orgId, person.name, type, 'active', person.confidence || 0.85, jobId]
        );
        const pid = insertRes.rows[0].id;
        savedPeople.push(pid);
        newPeople.push({ id: pid, name: person.name, type });
        await client.query(
          `INSERT INTO attendance_records (session_id, member_id, present, session_section_id)
           VALUES ($1, $2, true, $3)`,
          [sessionId, pid, sectionId]
        );
        await client.query(
          `INSERT INTO timeline_events (person_id, organization_id, event_type, description, metadata)
           VALUES ($1, $2, 'attendance', 'Present at ' || $3, jsonb_build_object('program', $3))`,
          [pid, orgId, programName]
        );
        continue;
      }

      const insertRes = await client.query(
        `INSERT INTO people (organization_id, first_name, phone, type, status, confidence, source, created_by, last_scan_job_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'scan', NULL, $7)
         ON CONFLICT (organization_id, phone) DO NOTHING
         RETURNING id`,
        [orgId, person.name, person.phone, type, 'active', person.confidence || 0.85, jobId]
      );

      let pid;
      if (insertRes.rows.length > 0) {
        pid = insertRes.rows[0].id;
        newPeople.push({ id: pid, name: person.name, type });
      } else {
        const existing = await client.query(
          `SELECT id FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
          [orgId, person.phone]
        );
        if (existing.rows.length === 0) {
          throw new Error(`Failed to find existing person for phone ${person.phone}`);
        }
        pid = existing.rows[0].id;
        matchedPeople.push({ id: pid, name: person.name });
      }

      savedPeople.push(pid);
      await client.query(
        `INSERT INTO attendance_records (session_id, member_id, present, session_section_id)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (session_id, member_id) DO UPDATE SET present = true`,
        [sessionId, pid, sectionId]
      );
      await client.query(
        `INSERT INTO timeline_events (person_id, organization_id, event_type, description, metadata)
         VALUES ($1, $2, 'attendance', 'Present at ' || $3, jsonb_build_object('program', $3))`,
        [pid, orgId, programName]
      );
    }

    // Mark absent only for COMPLETE register mode
    let allActiveIds = [];
    if (registerMode === 'complete') {
      const allActive = await client.query(`SELECT id FROM people WHERE organization_id = $1 AND status = 'active'`, [orgId]);
      allActiveIds = allActive.rows.map(r => r.id);
      for (const row of allActive.rows) {
        if (!savedPeople.includes(row.id)) {
          await client.query(
            `INSERT INTO attendance_records (session_id, member_id, present, session_section_id)
             VALUES ($1, $2, false, $3)
             ON CONFLICT (session_id, member_id) DO NOTHING`,
            [sessionId, row.id, sectionId]
          );
        }
      }
    }

    await client.query('COMMIT');

    const result = {
      status: 'ok',
      present_count: savedPeople.length,
      absent_count: registerMode === 'complete' ? (allActiveIds.length - savedPeople.length) : undefined,
      new_members: newPeople.length,
      updated: matchedPeople.length,
      people: validation.people.map(p => ({ name: p.name, phone: p.phone, confidence: p.confidence })),
      duplicates: validation.duplicates.map(d => ({
        name: d.incoming.name,
        phone: d.incoming.phone,
        existing: { id: d.existing.id, name: d.existing.first_name },
        confidence: d.confidence,
      })),
      needs_review: validation.needsReview.map(nr => ({
        name: nr.incoming.name,
        phone: nr.incoming.phone,
        confidence: nr.confidence,
        relationship_stage: nr.relationship_stage || 'uncertain',
      })),
      rejected: validation.rejected || [],
      total_extracted: validation.total_extracted,
      total_valid: validation.total_valid,
      register_mode: registerMode,
      summary: `ARIA processed ${savedPeople.length} people. ${newPeople.length} new, ${matchedPeople.length} recognised, ${validation.needsReview.length} need review.`
    };

    await updateJobState(client, jobId, INTERNAL_STATES.COMPLETED, 'complete', result, attemptCount, providerUsed, startTime);
    console.log(`Job ${jobId} completed in ${(Date.now() - startTime)}ms`);

    return result;

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Scan job ${jobId} failed unexpectedly:`, err.message, err.stack);
    const errorObj = createError(
      'database_insert',
      'DB_TRANSACTION_ERROR',
      err.message || 'Database transaction failed',
      'ARIA could not save the scan results. Please try again.',
      err.stack ? err.stack.substring(0, 200) : null
    );
    if (!evaluation) {
      await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', errorObj, 0, null, startTime);
    }
    return { error: errorObj };
  } finally {
    client.release();
  }
                   }
