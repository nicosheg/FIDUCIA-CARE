// lib/aria/director.js
import pool from '../db';
import { resolveIdentities } from '../identityResolver';
import { generateIdentityObservations } from './observers/identityObserver';

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
 * Initialize baseline Living Truth for all active people in an organization.
 * 
 * 1. Migrate any existing 'canonical' records to 'alive' with source 'canonical_record'.
 * 2. Set baseline 'alive' for any person with null living_truth.
 * 3. Then run the identity observer to detect duplicates and update conflicts.
 */
export async function initializeCommunity(orgId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Step 1: Migrate canonical → alive (source: canonical_record) ──
    const canonicalRes = await client.query(
      `SELECT id, living_truth
       FROM people
       WHERE organization_id = $1
         AND status = 'active'
         AND living_truth IS NOT NULL
         AND living_truth->>'status' = 'canonical'`,
      [orgId]
    );

    if (canonicalRes.rows.length > 0) {
      for (const row of canonicalRes.rows) {
        const newTruth = {
          status: 'alive',
          confidence: row.living_truth.confidence || 90,
          source: 'canonical_record',
          updated_at: new Date().toISOString(),
        };
        await client.query(
          `UPDATE people
           SET living_truth = $1
           WHERE id = $2 AND organization_id = $3`,
          [newTruth, row.id, orgId]
        );
      }
      console.log(`[ARIA] Migrated ${canonicalRes.rows.length} canonical records to alive.`);
    }

    // ── Step 2: Set baseline alive for any null living_truth ──
    const nullRes = await client.query(
      `SELECT id FROM people
       WHERE organization_id = $1
         AND status = 'active'
         AND living_truth IS NULL`,
      [orgId]
    );

    if (nullRes.rows.length > 0) {
      const ids = nullRes.rows.map(r => r.id);
      const baselineTruth = JSON.stringify({
        status: 'alive',
        confidence: 90,
        source: 'canonical_record',
        updated_at: new Date().toISOString(),
      });
      await client.query(
        `UPDATE people
         SET living_truth = $1
         WHERE id = ANY($2)
           AND organization_id = $3`,
        [baselineTruth, ids, orgId]
      );
      console.log(`[ARIA] Set baseline alive for ${ids.length} people with null living_truth.`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ARIA] initializeCommunity baseline error:', err);
    throw err;
  } finally {
    client.release();
  }

  // ── Step 3: Run identity observations ──
  await processIdentityObservations(orgId);
}

/**
 * Process observations from the identity observer.
 * Updates Living Truth for people who are still in a baseline state
 * (i.e., status = 'canonical' OR (status = 'alive' AND source = 'canonical_record')).
 * This ensures existing members receive ARIA reasoning.
 */
async function processIdentityObservations(orgId) {
  const observations = await generateIdentityObservations(orgId);
  if (observations.length === 0) {
    console.log('[ARIA] No identity observations.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const obs of observations) {
      // Only handle duplicate_phone for Day 1
      if (obs.type !== 'duplicate_phone') continue;

      // Check current living_truth – only update if it's still baseline or canonical
      const current = await client.query(
        `SELECT living_truth FROM people WHERE id = $1 AND organization_id = $2`,
        [obs.person_id, orgId]
      );
      const lt = current.rows[0]?.living_truth;
      if (!lt) continue; // should not happen after baseline step

      const status = lt.status;
      const source = lt.source;

      // Eligible if status is 'canonical' OR (status === 'alive' AND source === 'canonical_record')
      const isEligible = (status === 'canonical') || (status === 'alive' && source === 'canonical_record');
      if (!isEligible) {
        continue; // Already resolved or conflict, don't override
      }

      const newTruth = {
        status: 'conflict',
        confidence: obs.confidence,
        evidence: [obs.evidence],
        source: 'community_observer',
        updated_at: new Date().toISOString(),
      };

      await client.query(
        `UPDATE people
         SET living_truth = $1
         WHERE id = $2
           AND organization_id = $3`,
        [newTruth, obs.person_id, orgId]
      );
      console.log(`[ARIA] Updated person ${obs.person_id} to conflict (${obs.type})`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ARIA] processIdentityObservations error:', err);
    throw err;
  } finally {
    client.release();
  }
      }
