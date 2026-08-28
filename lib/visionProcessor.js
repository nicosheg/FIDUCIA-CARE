// lib/visionProcessor.js
// Canonical scan pipeline: AI -> validation -> identity resolution -> people memory.
// IMPORTANT: A scan does NOT confirm attendance or absence.
// Attendance is written only by the explicit attendance workflow.

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

async function updateJobState(client, jobId, state, progress, result, attemptCount, provider, startTime) {
  const status = dbStatusFromInternal(state);
  const now = new Date();
  const fields = {
    status,
    progress: progress || null,
    heartbeat: now,
    last_progress_at: now,
    attempt_count: attemptCount ?? undefined,
    provider_used: provider || undefined,
    completed_at: [INTERNAL_STATES.COMPLETED, INTERNAL_STATES.FAILED, INTERNAL_STATES.TIMED_OUT].includes(state) ? now : undefined,
    duration_ms: [INTERNAL_STATES.COMPLETED, INTERNAL_STATES.FAILED, INTERNAL_STATES.TIMED_OUT].includes(state) ? Math.round(now - startTime) : undefined,
    result: result !== undefined && result !== null ? JSON.stringify(result) : undefined,
  };
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return;
  const setClause = entries.map(([key], i) => `${key} = $${i + 2}`).join(', ');
  await client.query(`UPDATE scan_jobs SET ${setClause} WHERE id = $1`, [jobId, ...entries.map(([, v]) => v)]);
}

function createError(stage, code, message, userMessage, details = null) {
  return { error: { stage, code, message, userMessage, details } };
}

export async function processVisionJob(jobId, imageBase64, orgId, programName, options = {}) {
  const { evaluation = false, registerMode = 'complete', actorId = null } = options || {};
  const startTime = Date.now();
  const client = await pool.connect();
  let transactionCommitted = false;

  try {
    if (!evaluation) await updateJobState(client, jobId, INTERNAL_STATES.ANALYSING, 'enhancing', null, 0, null, startTime);

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
        const cached = typeof existing.rows[0].result === 'string' ? JSON.parse(existing.rows[0].result) : existing.rows[0].result;
        await updateJobState(client, jobId, INTERNAL_STATES.COMPLETED, 'complete', cached, 0, 'cache', startTime);
        return cached;
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
            ).catch(err => console.error('[SCAN] Retry-state update failed:', err));
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
        err.stack?.substring(0, 200) || null
      );
      if (!evaluation) {
        await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', errorObj, 0, null, startTime);
        console.error(`[SCAN] Job ${jobId} failed at AI request:`, err.message);
      }
      return { error: errorObj };
    }

    const rawContent = data?.choices?.[0]?.message?.content;
    if (!rawContent) {
      const errorObj = createError(
        'ai_request',
        'EMPTY_AI_RESPONSE',
        'Vision provider returned no content.',
        'ARIA could not read the register. Please try again.',
        null
      );
      if (!evaluation) await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', errorObj, attemptCount, providerUsed, startTime);
      return { error: errorObj };
    }

    console.log('[SCAN] AI raw (first 300):', rawContent.substring(0, 300));

    if (!evaluation) await updateJobState(client, jobId, INTERNAL_STATES.EXTRACTING, 'reading_handwriting', null, attemptCount, providerUsed, startTime);

    let validation;
    try {
      validation = await validateScanOutput(rawContent, orgId, programName, jobId, { evaluation });
    } catch (err) {
      const errorObj = createError(
        'validation',
        'VALIDATION_ERROR',
        err.message || 'Validation failed',
        'ARIA could not understand the extracted data. Please try a clearer image.',
        err.stack?.substring(0, 200) || null
      );
      if (!evaluation) {
        await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', errorObj, attemptCount, providerUsed, startTime);
        console.error(`[SCAN] Job ${jobId} failed at validation:`, err.message);
      }
      return { error: errorObj };
    }

    const validatedCount = validation.people?.length || 0;
    console.log('[SCAN] Validation:', {
      extracted: validation.total_extracted,
      valid: validation.total_valid,
      people: validatedCount,
      duplicates: validation.duplicates?.length || 0,
      review: validation.needsReview?.length || 0,
    });

    if (!validation.valid) {
      const errorObj = createError(
        'parse_json',
        'INVALID_AI_RESPONSE',
        validation.error || 'Invalid JSON structure',
        'ARIA could not read the register clearly. Please try again with a clearer photo.',
        null
      );
      if (!evaluation) {
        await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', errorObj, attemptCount, providerUsed, startTime);
        console.error(`[SCAN] Job ${jobId} failed at parse stage:`, validation.error);
      }
      return { error: errorObj };
    }

    if (validation.total_extracted > MAX_PEOPLE_PER_SCAN) {
      const errorObj = createError(
        'validation',
        'TOO_MANY_PEOPLE',
        `Validation produced ${validation.total_extracted} people, exceeding limit of ${MAX_PEOPLE_PER_SCAN}.`,
        'Too many people were detected. Please ensure the register is a single page.',
        null
      );
      if (!evaluation) await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', errorObj, attemptCount, providerUsed, startTime);
      return { error: errorObj };
    }

    if (!validation.people.length && !validation.duplicates.length && !validation.needsReview.length) {
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
      if (!evaluation) await updateJobState(client, jobId, INTERNAL_STATES.COMPLETED, 'complete', result, attemptCount, providerUsed, startTime);
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

    if (!evaluation) await updateJobState(client, jobId, INTERNAL_STATES.VALIDATING, 'validating', null, attemptCount, providerUsed, startTime);

    const { needsReview, resolvedPeople } = await handleScanEvent(validation.people, orgId, jobId);

    if (!evaluation) await updateJobState(client, jobId, INTERNAL_STATES.MATCHING, 'matching_community', null, attemptCount, providerUsed, startTime);

    await client.query('BEGIN');

    // Scan creates/remembers people only. It MUST NOT create attendance or absence.
    const savedPeople = [];
    const matchedPeople = [];
    const newPeople = [];

    for (const dup of validation.duplicates) {
      const existingId = dup.existing.id;
      const existingName = dup.existing.first_name;
      if (existingName !== dup.incoming.name) {
        await client.query(
          `UPDATE people
           SET first_name = $1, last_scan_job_id = $2, updated_at = NOW()
           WHERE id = $3 AND organization_id = $4`,
          [dup.incoming.name, jobId, existingId, orgId]
        );
      }
      savedPeople.push(existingId);
      matchedPeople.push({ id: existingId, name: dup.incoming.name });
    }

    for (const person of validation.people) {
      const resolvedItem = resolvedPeople.find(p => p.name === person.name);
      let pid;

      if (resolvedItem?.resolved_person_id) {
        pid = resolvedItem.resolved_person_id;
        await client.query(
          `UPDATE people
           SET confidence = GREATEST(COALESCE(confidence, 0), $1),
               last_scan_job_id = $2,
               updated_at = NOW()
           WHERE id = $3 AND organization_id = $4`,
          [normalizeConfidence(person.confidence, 85), jobId, pid, orgId]
        );
        matchedPeople.push({ id: pid, name: person.name });
      } else {
        const type = ['regular', 'returning', 'familiar_face'].includes(person.relationship_stage) ? 'member' : 'visitor';
        const conf = normalizeConfidence(person.confidence, 70);
        const insertRes = await client.query(
          `INSERT INTO people (
             organization_id, first_name, phone, type, status, confidence,
             source, created_by, last_scan_job_id
           )
           VALUES ($1, $2, $3, $4, 'active', $5, 'scan', $6, $7)
           RETURNING id`,
          [orgId, person.name, person.phone || null, type, conf, actorId, jobId]
        );
        pid = insertRes.rows[0].id;
        newPeople.push({ id: pid, name: person.name, type });

        const event = await emitAriaEvent({
          organizationId: orgId,
          personId: pid,
          type: 'PERSON_CREATED',
          source: 'scan',
          metadata: { jobId, programName, confidence: conf },
          eventKey: `scan:${jobId}:person:${pid}`,
        }, client);

        if (event) await processAriaEvent(event, client);
      }

      savedPeople.push(pid);
    }

    await client.query('COMMIT');
    transactionCommitted = true;

    const result = {
      status: 'ok',
      present_count: 0,
      absent_count: 0,
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
        method: d.method,
      })),
      needs_review: [
        ...(validation.needsReview || []),
        ...(needsReview || []).filter(item => !item.resolved),
      ],
      review_stats: {
        total: (validation.needsReview || []).length + (needsReview || []).filter(i => !i.resolved).length,
        unresolved: (needsReview || []).filter(i => !i.resolved).length,
        resolved: (needsReview || []).filter(i => i.resolved).length,
      },
      rejected: validation.rejected || [],
      total_extracted: validation.total_extracted,
      total_valid: validation.total_valid,
      register_mode: registerMode,
      summary: `ARIA processed ${savedPeople.length} people. ${newPeople.length} new, ${matchedPeople.length} recognised, ${(needsReview || []).filter(i => !i.resolved).length} need review.`,
    };

    await updateJobState(client, jobId, INTERNAL_STATES.COMPLETED, 'complete', result, attemptCount, providerUsed, startTime);
    console.log(`[SCAN] Job ${jobId} completed in ${Date.now() - startTime}ms`);

    if (savedPeople.length) {
      Promise.resolve().then(async () => {
        try {
          await updateEngagementMetrics(orgId);
          await updateEngagementCases(orgId);
          for (const personId of [...new Set(savedPeople)]) await updatePersonState(personId, orgId);
          console.log(`[ARIA] Post-scan intelligence updated for ${orgId}`);
        } catch (err) {
          console.error(`[ARIA] Post-scan intelligence failed for ${orgId}:`, err);
        }
      });
    }

    return result;
  } catch (err) {
    if (!transactionCommitted) {
      try { await client.query('ROLLBACK'); } catch (rollbackErr) { console.error(`[SCAN] Rollback failed for ${jobId}:`, rollbackErr); }

      const errorObj = createError(
        'database_insert',
        'DB_TRANSACTION_ERROR',
        err.message || 'Database transaction failed',
        'ARIA could not save the scan results. Please try again.',
        err.stack?.substring(0, 200) || null
      );

      console.error(`[SCAN] Job ${jobId} failed:`, err.message);

      if (!evaluation) {
        try {
          await updateJobState(client, jobId, INTERNAL_STATES.FAILED, 'failed', errorObj, 0, null, startTime);
        } catch (stateErr) {
          console.error(`[SCAN] Failed to record failure state for ${jobId}:`, stateErr);
        }
      }

      return { error: errorObj };
    }

    console.error(`[SCAN] Post-commit error for ${jobId}:`, err);
    return { status: 'ok', warning: 'Scan committed successfully; a post-processing error occurred.' };
  } finally {
    client.release();
  }
    }
