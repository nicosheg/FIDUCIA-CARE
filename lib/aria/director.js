// lib/aria/director.js
import pool from '../db';
import { resolveIdentities } from '../identityResolver';

/**
 * ARIA Director – handles scan events, runs identity resolution,
 * persists Living Truth, and returns results for the scan pipeline.
 */
export async function handleScanEvent(extractedPeople, orgId, scanJobId) {
  console.log('[ARIA] Scan event received', {
    jobId: scanJobId,
    orgId,
    extractedCount: extractedPeople.length,
  });

  const decisions = await resolveIdentities(extractedPeople, orgId, scanJobId);
  console.log('[ARIA] Identity decisions:', decisions.map(d => ({
    name: d.extracted_name,
    status: d.status,
    candidateIds: d.candidate_ids,
    bestCandidate: d.best_candidate_id,
  })));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const dec of decisions) {
      if (dec.status === 'new') continue;

      const livingTruth = {
        status: dec.status,
        extracted_name: dec.extracted_name,
        extracted_phone: dec.extracted_phone,
        confidence: dec.confidence,
        candidate_ids: dec.candidate_ids,
        best_candidate_id: dec.best_candidate_id,
        review_id: dec.review_id,
        updated_at: new Date().toISOString(),
      };

      if (dec.status === 'conflict' || (dec.status === 'needs_decision' && dec.candidate_ids.length > 1)) {
        for (const candidateId of dec.candidate_ids) {
          await client.query(
            `UPDATE people SET living_truth = $1 WHERE id = $2 AND organization_id = $3`,
            [livingTruth, candidateId, orgId]
          );
          console.log('[ARIA] Persisting Living Truth (multi) for person', candidateId);
        }
      } else if (dec.best_candidate_id) {
        await client.query(
          `UPDATE people SET living_truth = $1 WHERE id = $2 AND organization_id = $3`,
          [livingTruth, dec.best_candidate_id, orgId]
        );
        console.log('[ARIA] Persisting Living Truth for person', dec.best_candidate_id, 'status', dec.status);
      } else if (dec.candidate_ids.length === 1) {
        const onlyId = dec.candidate_ids[0];
        await client.query(
          `UPDATE people SET living_truth = $1 WHERE id = $2 AND organization_id = $3`,
          [livingTruth, onlyId, orgId]
        );
        console.log('[ARIA] Persisting Living Truth (fallback) for person', onlyId);
      }
    }

    await client.query('COMMIT');
    console.log('[ARIA] Living Truth persistence complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ARIA] Director error:', err);
    throw err;
  } finally {
    client.release();
  }

  // ── Build resolvedPeople and needsReview ──
  const resolvedPeople = [];
  const needsReview = [];

  for (const dec of decisions) {
    if (dec.status === 'alive' && dec.best_candidate_id) {
      resolvedPeople.push({
        name: dec.extracted_name,
        phone: dec.extracted_phone,
        resolved_person_id: dec.best_candidate_id,
        status: dec.status,
        confidence: dec.confidence,
      });
    }
    if (dec.status !== 'new') {
      needsReview.push({ ...dec, resolved: false });
    }
  }

  return {
    needsReview,
    resolvedPeople,
  };
}

/**
 * Initialize baseline Living Truth for all active people in an organization
 * who currently have living_truth IS NULL.
 *
 * Only runs if the organization has NO living_truth records at all.
 * Sets status = 'canonical' with confidence = 100 and source = 'canonical_record'.
 * Does NOT overwrite any existing living_truth.
 */
export async function initializeCommunity(orgId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Check if any living_truth already exists ──
    const checkRes = await client.query(
      `SELECT COUNT(*) as count FROM people
       WHERE organization_id = $1 AND living_truth IS NOT NULL`,
      [orgId]
    );
    const existingCount = parseInt(checkRes.rows[0].count, 10);

    if (existingCount > 0) {
      console.log(`[ARIA] Living Truth already exists for ${existingCount} people. Skipping initialization.`);
      await client.query('COMMIT');
      return { initialized: 0, skipped: true };
    }

    // ── Get all active people without living_truth ──
    const res = await client.query(
      `SELECT id FROM people
       WHERE organization_id = $1
         AND status = 'active'
         AND living_truth IS NULL`,
      [orgId]
    );

    if (res.rows.length === 0) {
      console.log('[ARIA] No people need baseline Living Truth.');
      await client.query('COMMIT');
      return { initialized: 0 };
    }

    const ids = res.rows.map(r => r.id);
    const baselineTruth = JSON.stringify({
      status: 'canonical',
      confidence: 100,
      source: 'canonical_record',
      updated_at: new Date().toISOString(),
    });

    await client.query(
      `UPDATE people
       SET living_truth = $1
       WHERE id = ANY($2)
         AND organization_id = $3
         AND living_truth IS NULL`,
      [baselineTruth, ids, orgId]
    );

    const updatedCount = res.rows.length;
    await client.query('COMMIT');
    console.log(`[ARIA] Baseline Living Truth initialized for ${updatedCount} people.`);
    return { initialized: updatedCount };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ARIA] initializeCommunity error:', err);
    throw err;
  } finally {
    client.release();
  }
        }
