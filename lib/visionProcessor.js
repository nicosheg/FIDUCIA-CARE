// lib/visionProcessor.js
import pool from './db';
import { callVisionWithRetry } from './aiProvider';
import { validateScanOutput, MAX_PEOPLE_PER_SCAN } from './scanValidation';
import { INTERNAL_STATES, dbStatusFromInternal } from './scanState';
import crypto from 'crypto';
import { normalizeConfidence } from './confidenceUtils';
import { handleScanEvent } from './aria/director';
import { emitAriaEvent } from './aria/eventEmitter';
import { processAriaEvent } from './aria/eventProcessor';
import { updateEngagementMetrics } from './aria/engagementIntelligence';
import { updateEngagementCases } from './aria/engagementCases';
import { updatePersonState } from './aria/stateManager';

// Updates scan_jobs using the canonical retry_count/status fields.
async function updateJobState(client, jobId, state, progress, result, attemptCount, provider, startTime) {
  const status = dbStatusFromInternal(state);
  const now = new Date();
  const terminal = [INTERNAL_STATES.COMPLETED, INTERNAL_STATES.FAILED, INTERNAL_STATES.TIMED_OUT].includes(state);
  const fields = {
    status,
    progress: progress || null,
    heartbeat: now,
    last_progress_at: now,
    retry_count: attemptCount ?? undefined,
    provider_used: provider || undefined,
    completed_at: terminal ? now : undefined,
    duration_ms: [INTERNAL_STATES.COMPLETED, INTERNAL_STATES.FAILED].includes(state) ? Math.round(now - startTime) : undefined,
    result: result === undefined || result === null ? undefined : typeof result === 'string' ? result : JSON.stringify(result),
  };

  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return;

  const setClause = entries.map(([key], i) => `${key} = $${i + 2}`).join(', ');
  await client.query(
    `UPDATE scan_jobs SET ${setClause} WHERE id = $1`,
    [jobId, ...entries.map(([, v]) => v)]
  );
}

function createError(stage, code, message, userMessage, details = null) {
  return { error: { stage, code, message, userMessage, details } };
}

export async function processVisionJob(jobId, imageBase64, orgId, programName, options = {}) {
  const { evaluation = false, registerMode = 'complete', actorId = null } = options;
  const startTime = Date.now();
  const client = await pool.connect();
  let transactionCommitted = false;

  try {
    if (!evaluation) {
      await updateJobState(client, jobId, INTERNAL_STATES.ANALYSING, 'enhancing', null, 0, null, startTime);
    }

    // Prevent processing the same completed image twice.
    const hash = crypto.createHash('sha256').update(imageBase64).digest('hex');

    if (!evaluation) {
      await client.query(`UPDATE scan_jobs SET image_hash = $1 WHERE id = $2`, [hash, jobId]);

      const existing = await client.query(
        `SELECT id, result FROM scan_jobs
         WHERE organization_id = $1 AND image_hash = $2 AND status = 'complete'
         LIMIT 1`,
        [orgId, hash]
      );

      if (existing.rows.length) {
        const cached = existing.rows[0].result;
        await updateJobState(
          client,
          jobId,
          INTERNAL_STATES.COMPLETED,
          'complete',
          cached,
          0,
          'cache',
          startTime
        );
        return typeof cached === 'string' ? JSON.parse(cached) : cached;
      }
    }

    let data, providerUsed, attemptCount;

    try {
      const result = await callVisionWithRetry(
        imageBase64,
        (attempt) => {
          if (!evaluation) {
            updateJobState(
              client,
              jobId,
              INTERNAL_STATES.RETRYING,
              'retrying',
              { message: `ARIA is retrying (${attempt})` },
              attempt,
              'Groq',
              startTime
            ).catch(err => console.error(`[SCAN] Retry-state update failed:`, err));
          }
        },
        {
          organization_id: orgId,
          job_id: jobId,
          purpose: 'scan',
          prompt_version: 'v2',
          evaluation,
        }
      );

      data = result.data;
      providerUsed = result.provider;
      attemptCount = result.attempt;
    } catch (err) {
      const errorObj = createError(
        'ai_request',
        'AI_PROVIDER_ERROR',
        err.message || 'Unknown provider error',
        'ARIA could not process the image. Please try again.',
        err.stack ? err.stack.substring(0, 200) : null
      );

      if (!evaluation) {
        await updateJobState(
          client,
          jobId,
          INTERNAL_STATES.FAILED,
          'failed',
          errorObj,
          attemptCount || 0,
          providerUsed || null,
          startTime
        );
      }
      console.error(`[SCAN] Job ${jobId} failed at AI request:`, err.message);
      return { error: errorObj };
    }

    const rawContent = data?.choices?.[0]?.message?.content;

    if (!evaluation) {
      await updateJobState(
        client,
        jobId,
        INTERNAL_STATES.EXTRACTING,
        'reading_handwriting',
        null,
        attemptCount,
        providerUsed,
        startTime
      );
    }

    let validation;

    try {
      validation = await validateScanOutput(
        rawContent,
        orgId,
        programName,
        jobId,
        { evaluation }
      );
    } catch (err) {
      const errorObj = createError(
        'validation',
        'VALIDATION_ERROR',
        err.message || 'Validation failed',
        'ARIA could not understand the extracted data. Please try a clearer image.',
        err.stack ? err.stack.substring(0, 200) : null
      );

      if (!evaluation) {
        await updateJobState(
          client,
          jobId,
          INTERNAL_STATES.FAILED,
          'failed',
          errorObj,
          attemptCount,
          providerUsed,
          startTime
        );
      }
      return { error: errorObj };
    }

    console.log('[SCAN] Validation:', {
      extracted: validation.total_extracted,
      valid: validation.total_valid,
      people: validation.people?.length || 0,
      duplicates: validation.duplicates?.length || 0,
      review: validation.needsReview?.length || 0,
    });

    if (!validation.valid) {
      const errorObj = createError(
        'parse_json',
        'INVALID_AI_RESPONSE',
        validation.error || 'Invalid JSON structure',
        'ARIA could not read the register clearly. Please try again with a clearer photo.'
      );

      if (!evaluation) {
        await updateJobState(
          client,
          jobId,
          INTERNAL_STATES.FAILED,
          'failed',
          errorObj,
          attemptCount,
          providerUsed,
          startTime
        );
      }
      return { error: errorObj };
    }

    const validatedCount = validation.people?.length || 0;

    if (validatedCount > MAX_PEOPLE_PER_SCAN) {
      const errorObj = createError(
        'validation',
        'TOO_MANY_PEOPLE',
        `Validation produced ${validatedCount} people, exceeding limit of ${MAX_PEOPLE_PER_SCAN}.`,
        'Too many people extracted. Please ensure the register is a single page.'
      );

      if (!evaluation) {
        await updateJobState(
          client,
          jobId,
          INTERNAL_STATES.FAILED,
          'failed',
          errorObj,
          attemptCount,
          providerUsed,
          startTime
        );
      }
      return { error: errorObj };
    }

    const hasResults =
      validation.people.length ||
      validation.duplicates.length ||
      validation.needsReview.length;

    if (!hasResults) {
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
        register_mode: registerMode,
        summary: 'ARIA read the register but found no people. Nothing was added.',
      };

      if (!evaluation) {
        await updateJobState(client, jobId, INTERNAL_STATES.COMPLETED, 'complete', result, attemptCount, providerUsed, startTime);
      }
      return result;
    }

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

    // Resolve new identities/events before persistence transaction.
    const { needsReview, resolvedPeople } = await handleScanEvent(
      validation.people,
      orgId,
      jobId,
      actorId
    );

    await updateJobState(client, jobId, INTERNAL_STATES.VALIDATING, 'validating', null, attemptCount, providerUsed, startTime);
    await updateJobState(client, jobId, INTERNAL_STATES.MATCHING, 'matching_community', null, attemptCount, providerUsed, startTime);

    await client.query('BEGIN');

    const today = new Date().toISOString().slice(0, 10);
    let sessionId;

    const existingSession = await client.query(
      `SELECT id FROM sessions
       WHERE organization_id = $1 AND name = $2 AND created_at::date = $3`,
      [orgId, programName, today]
    );

    if (existingSession.rows.length) {
      sessionId = existingSession.rows[0].id;
    } else {
      const newSession = await client.query(
        `INSERT INTO sessions (organization_id, name, status)
         VALUES ($1, $2, 'active') RETURNING id`,
        [orgId, programName]
      );
      sessionId = newSession.rows[0].id;
    }

    const sectionRes = await client.query(
      `SELECT id FROM session_sections WHERE session_id = $1 AND name = 'All'`,
      [sessionId]
    );

    let sectionId;

    if (sectionRes.rows.length) {
      sectionId = sectionRes.rows[0].id;
    } else {
      const newSection = await client.query(
        `INSERT INTO session_sections (session_id, name)
         VALUES ($1, 'All') RETURNING id`,
        [sessionId]
      );
      sectionId = newSection.rows[0].id;
    }

    const savedPeople = [];
    const matchedPeople = [];
    const newPeople = [];

    // High-confidence existing identities from validation.
    for (const dup of validation.duplicates) {
      const existingId = dup.existing.id;

      if (dup.existing.first_name !== dup.incoming.name) {
        await client.query(
          `UPDATE people
           SET first_name = $1, last_scan_job_id = $2, updated_at = NOW()
           WHERE id = $3`,
          [dup.incoming.name, jobId, existingId]
        );
      }

      await markAttendance(client, sessionId, existingId, sectionId, today, orgId);
      savedPeople.push(existingId);
      matchedPeople.push({ id: existingId, name: dup.incoming.name });
    }

    // Validated people: either resolve to canonical people.id or create one.
    for (const person of validation.people) {
      const resolvedItem = resolvedPeople.find(p => p.name === person.name);
      let pid;

      if (resolvedItem?.resolved_person_id) {
        pid = resolvedItem.resolved_person_id;
        matchedPeople.push({ id: pid, name: person.name });

        const conf = normalizeConfidence(parseFloat(person.confidence), 85);

        await client.query(
          `UPDATE people
           SET confidence = GREATEST(confidence, $1),
               last_scan_job_id = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [conf, jobId, pid]
        );
      } else {
        const type = ['regular', 'returning', 'familiar_face'].includes(person.relationship_stage)
          ? 'member'
          : 'visitor';
        const conf = normalizeConfidence(parseFloat(person.confidence), 70);

        const insertRes = await client.query(
          `INSERT INTO people (
             organization_id, first_name, phone, type, status,
             confidence, source, created_by, last_scan_job_id
           )
           VALUES ($1, $2, $3, $4, 'active', $5, 'scan', $6, $7)
           RETURNING id`,
          [orgId, person.name, person.phone || null, type, conf, actorId, jobId]
        );

        pid = insertRes.rows[0].id;
        newPeople.push({ id: pid, name: person.name, type });

        // Every created person gets one idempotent ARIA creation event.
        const event = await emitAriaEvent({
          organizationId: orgId,
          personId: pid,
          type: 'PERSON_CREATED',
          source: 'scan',
          actorId,
          metadata: { jobId, programName, confidence: conf },
          eventKey: `scan:${jobId}:person:${pid}`,
        }, client);

        if (event) await processAriaEvent(event, client);
      }

      savedPeople.push(pid);
      await markAttendance(client, sessionId, pid, sectionId, today, orgId);
    }

    const uniqueSaved = [...new Set(savedPeople)];

    const result = {
      status: 'ok',
      present_count: uniqueSaved.length,
      absent_count: undefined,
      new_members: newPeople.length,
      updated: matchedPeople.length,
      people: validation.people.map(p => ({
        name: p.name,
        phone: p.phone,
        confidence: normalizeConfidence(p.confidence, 70),
      })),
      duplicates: validation.duplicates.map(d => ({
        name: d.incoming.name,
        phone: d.incoming.phone,
        existing: { id: d.existing.id, name: d.existing.first_name },
        confidence: d.confidence,
      })),
      needs_review: needsReview.filter(item => !item.resolved),
      review_stats: {
        total: needsReview.length,
        alive: needsReview.filter(i => i.status === 'alive').length,
        needs_decision: needsReview.filter(i => i.status === 'needs_decision').length,
        conflict: needsReview.filter(i => i.status === 'conflict').length,
        resolved: needsReview.filter(i => i.resolved).length,
      },
      rejected: validation.rejected || [],
      total_extracted: validation.total_extracted,
      total_valid: validation.total_valid,
      register_mode: registerMode,
      summary: `ARIA processed ${uniqueSaved.length} people. ${newPeople.length} new, ${matchedPeople.length} recognised, ${needsReview.filter(i => !i.resolved).length} need review.`,
    };

    // Final job state is part of the same transaction as the scan data.
    await updateJobState(
      client,
      jobId,
      INTERNAL_STATES.COMPLETED,
      'complete',
      result,
      attemptCount,
      providerUsed,
      startTime
    );

    await client.query('COMMIT');
    transactionCommitted = true;

    console.log(`[SCAN] Job ${jobId} completed in ${Date.now() - startTime}ms`);

    // Intelligence is deliberately post-commit and failure-isolated.
    if (uniqueSaved.length) {
      Promise.resolve().then(async () => {
        try {
          await updateEngagementMetrics(orgId);
          await updateEngagementCases(orgId);
          for (const personId of uniqueSaved) {
            await updatePersonState(personId, orgId);
          }
          console.log(`[ARIA] Engagement intelligence updated for org ${orgId}`);
        } catch (err) {
          console.error(`[ARIA] Post-scan intelligence failed for org ${orgId}:`, err);
        }
      });
    }

    return result;
  } catch (err) {
    if (!transactionCommitted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error(`[SCAN] Job ${jobId} rollback failed:`, rollbackErr);
      }

      console.error(`[SCAN] Job ${jobId} failed:`, err.message, err.stack);

      const errorObj = createError(
        'database_insert',
        'DB_TRANSACTION_ERROR',
        err.message || 'Database transaction failed',
        'ARIA could not save the scan results. Please try again.',
        err.stack ? err.stack.substring(0, 200) : null
      );

      if (!evaluation) {
        try {
          await updateJobState(
            client,
            jobId,
            INTERNAL_STATES.FAILED,
            'failed',
            errorObj,
            0,
            null,
            startTime
          );
        } catch (stateErr) {
          console.error(`[SCAN] Failed to record failed state for ${jobId}:`, stateErr);
        }
      }

      return { error: errorObj };
    }

    console.error(`[SCAN] Post-commit error for ${jobId}:`, err);
    return {
      status: 'ok',
      warning: 'Scan committed successfully; a post-processing error occurred.',
    };
  } finally {
    client.release();
  }
}

// Canonical attendance + participation write.
// Scan marks only people actually extracted/present; it does NOT create absences.
async function markAttendance(client, sessionId, peopleId, sectionId, date, orgId) {
  const existing = await client.query(
    `SELECT id FROM attendance_records
     WHERE people_id = $1 AND attendance_date = $2
     LIMIT 1`,
    [peopleId, date]
  );

  if (existing.rows.length) {
    await client.query(
      `UPDATE attendance_records
       SET present = true, session_id = $1,
           session_section_id = $2, marked_at = NOW()
       WHERE id = $3`,
      [sessionId, sectionId, existing.rows[0].id]
    );
  } else {
    await client.query(
      `INSERT INTO attendance_records (
         session_id, people_id, present,
         session_section_id, attendance_date
       )
       VALUES ($1, $2, true, $3, $4)`,
      [sessionId, peopleId, sectionId, date]
    );
  }

  const participation = await client.query(
    `SELECT id FROM participation_records
     WHERE person_id = $1
       AND participation_date = $2
       AND organization_id = $3
     LIMIT 1`,
    [peopleId, date, orgId]
  );

  if (participation.rows.length) {
    await client.query(
      `UPDATE participation_records
       SET present = true, updated_at = NOW()
       WHERE id = $1`,
      [participation.rows[0].id]
    );
  } else {
    await client.query(
      `INSERT INTO participation_records (
         organization_id, person_id, participation_date,
         present, created_at
       )
       VALUES ($1, $2, $3, true, NOW())`,
      [orgId, peopleId, date]
    );
  }
     }
