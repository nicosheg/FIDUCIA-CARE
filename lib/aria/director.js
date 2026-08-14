// lib/aria/director.js
import pool from '../db';
import { resolveIdentities } from '../identityResolver';
import { generateDuplicatePhoneObservations } from './observers/duplicatePhoneObserver';
// --- To enable similar-name observer, uncomment the line below ---
// import { generateSimilarNameObservations } from './observers/similarNameObserver';

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
 * Initialize baseline Living Truth for all active people.
 * 
 * 1. Migrate existing 'canonical' records to 'alive' (source: canonical_record).
 * 2. Set baseline 'alive' for any person with null living_truth.
 * 3. Then run observers and let ARIA decide if any evidence is strong enough.
 * 
 * Deployment order: duplicate‑phone observer is called first.
 * Similar‑name observer is included but commented out – enable it after deployment.
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

  // ── Step 3: Run observers and process evidence ──
  // Only duplicate‑phone observer is enabled initially.
  // To enable similar‑name observer, uncomment the import above and add it to the array below.
  const allObservations = [
    ...await generateDuplicatePhoneObservations(orgId),
    // ...await generateSimilarNameObservations(orgId), // Uncomment when ready
  ];
  await processObservations(orgId, allObservations);
}

/**
 * Process observations from all observers.
 * ARIA Director combines evidence using a conservative weighted‑average approach.
 * 
 * Decision rules:
 * - Only apply to people currently in baseline state (canonical or alive from canonical_record).
 * - Compute combined confidence as a weighted average: 
 *   combined = averageConfidence + (count-1) * 5 (capped at 100).
 * - If combinedConfidence >= 85, set status to 'needs_decision'.
 * - Otherwise, keep alive.
 * 
 * This ensures that multiple moderate evidences are required to move from alive.
 */
async function processObservations(orgId, observations) {
  if (observations.length === 0) {
    console.log('[ARIA] No observations to process.');
    return;
  }

  // Group by person_id
  const evidenceMap = new Map();
  for (const obs of observations) {
    if (!evidenceMap.has(obs.person_id)) {
      evidenceMap.set(obs.person_id, []);
    }
    evidenceMap.get(obs.person_id).push(obs);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [personId, evList] of evidenceMap) {
      // Check current living_truth – only update if it's still baseline
      const current = await client.query(
        `SELECT living_truth FROM people WHERE id = $1 AND organization_id = $2`,
        [personId, orgId]
      );
      const lt = current.rows[0]?.living_truth;
      if (!lt) continue;

      const status = lt.status;
      const source = lt.source;
      const isEligible = (status === 'canonical') || (status === 'alive' && source === 'canonical_record');
      if (!isEligible) continue; // already resolved or conflict

      // ── Combine evidence conservatively ──
      let totalConfidence = 0;
      const evidenceArray = [];
      for (const ev of evList) {
        totalConfidence += ev.confidence;
        evidenceArray.push(ev.evidence);
      }
      const count = evList.length;
      const averageConfidence = totalConfidence / count;
      
      // Conservative boost: add 5 points per additional evidence, capped at 100.
      let combinedScore = averageConfidence + (count - 1) * 5;
      combinedScore = Math.min(100, combinedScore);

      console.log(`[ARIA] Person ${personId}: ${count} observations, avg=${averageConfidence.toFixed(0)}, combined=${combinedScore.toFixed(0)}`);

      // ── Decision logic ──
      let newStatus = null;
      let newConfidence = combinedScore;

      if (combinedScore >= 85) {
        newStatus = 'needs_decision';
      } else {
        // Not enough evidence – keep alive
        continue;
      }

      // Build new Living Truth with evidence and observed_at timestamps
      const newTruth = {
        status: newStatus,
        confidence: newConfidence,
        evidence: evidenceArray,
        source: 'community_observer',
        updated_at: new Date().toISOString(),
      };

      await client.query(
        `UPDATE people
         SET living_truth = $1
         WHERE id = $2
           AND organization_id = $3`,
        [newTruth, personId, orgId]
      );
      console.log(`[ARIA] Updated person ${personId} to ${newStatus} (combined confidence ${newConfidence.toFixed(0)})`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ARIA] processObservations error:', err);
    throw err;
  } finally {
    client.release();
  }
    }
