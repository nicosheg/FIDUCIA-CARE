// lib/aria/director.js
import pool from '../db';
import { resolveIdentities } from '../identityResolver';
import { generateDuplicatePhoneObservations } from './observers/duplicatePhoneObserver';
import { generateSimilarNameObservations } from './observers/similarNameObserver';
import { generatePhoneSimilarityObservations } from './observers/phoneSimilarityObserver';

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
 * 3. Then run all observers and let ARIA decide if any evidence is strong enough.
 * 
 * Observers used: duplicate phone, similar name, similar phone.
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

  // ── Step 3: Run all observers and process pair evidence ──
  const allObservations = [
    ...await generateDuplicatePhoneObservations(orgId),
    ...await generateSimilarNameObservations(orgId),
    ...await generatePhoneSimilarityObservations(orgId),
  ];
  await processPairObservations(orgId, allObservations);
}

/**
 * Process observations as pairs.
 * Groups evidence by (min(person_id), max(person_id)).
 * Computes combined score per pair and updates both persons if score ≥ 85.
 * 
 * Decision rules:
 * - Duplicate phone (exact match) alone: combined score ≥ 85 (ensures review).
 * - Similar name alone: not enough (unless combined with other evidence).
 * - Similar phone alone: not enough.
 * - Similar name + similar phone: combined score typically ≥ 85 → needs_review.
 */
async function processPairObservations(orgId, observations) {
  if (observations.length === 0) {
    console.log('[ARIA] No observations to process.');
    return;
  }

  // Group by pair (person_a, person_b) where a < b
  const pairMap = new Map();
  for (const obs of observations) {
    // Obs has person_id and evidence.matched_person_id (or other_person_ids)
    // We need to extract the other person(s) from the evidence.
    let otherIds = [];
    if (obs.evidence.matched_person_id) {
      otherIds = [obs.evidence.matched_person_id];
    } else if (obs.evidence.other_person_ids) {
      otherIds = obs.evidence.other_person_ids;
    } else {
      continue; // skip if no pair info
    }
    for (const otherId of otherIds) {
      const a = Math.min(obs.person_id, otherId);
      const b = Math.max(obs.person_id, otherId);
      const key = `${a}:${b}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, { person_a: a, person_b: b, observations: [] });
      }
      pairMap.get(key).observations.push(obs);
    }
  }

  if (pairMap.size === 0) {
    console.log('[ARIA] No pair evidence found.');
    return;
  }

  const client = await pool.connect();
  const decisions = [];
  try {
    await client.query('BEGIN');

    for (const [key, pair] of pairMap) {
      const { person_a, person_b, observations: obsList } = pair;

      // Check if both persons are still in baseline state (eligible for update)
      const checkA = await client.query(
        `SELECT living_truth FROM people WHERE id = $1 AND organization_id = $2`,
        [person_a, orgId]
      );
      const checkB = await client.query(
        `SELECT living_truth FROM people WHERE id = $1 AND organization_id = $2`,
        [person_b, orgId]
      );
      const ltA = checkA.rows[0]?.living_truth;
      const ltB = checkB.rows[0]?.living_truth;
      if (!ltA || !ltB) continue;

      const isEligible = (lt) => {
        const status = lt?.status;
        const source = lt?.source;
        return (status === 'canonical') || (status === 'alive' && source === 'canonical_record');
      };
      if (!isEligible(ltA) || !isEligible(ltB)) continue;

      // ---- Compute combined score for this pair ----
      let totalConfidence = 0;
      const evidenceArray = [];
      const typeSet = new Set();
      for (const obs of obsList) {
        totalConfidence += obs.confidence;
        evidenceArray.push(obs.evidence);
        typeSet.add(obs.type);
      }
      const count = obsList.length;
      const uniqueTypes = typeSet.size;
      const averageConfidence = totalConfidence / count;

      // Boost per unique type (+5) and extra evidence (+2)
      let combinedScore = averageConfidence + (uniqueTypes - 1) * 5 + (count - uniqueTypes) * 2;
      combinedScore = Math.min(100, combinedScore);

      // Special rule: duplicate phone (exact match) should always trigger review
      let hasDuplicatePhone = false;
      for (const obs of obsList) {
        if (obs.type === 'duplicate_phone') hasDuplicatePhone = true;
      }
      if (hasDuplicatePhone && combinedScore < 85) {
        combinedScore = 85; // Ensure duplicate phone alone triggers review
      }

      // If score < 85, skip
      if (combinedScore < 85) continue;

      decisions.push({
        person_a,
        person_b,
        combinedScore,
        uniqueTypes,
        count,
        types: Array.from(typeSet),
      });

      // Update both persons with review information
      const reviewData = {
        matched_person_id: person_b,
        evidence: evidenceArray,
        combined_score: combinedScore,
        status: 'needs_review', // internal status for the pair
        updated_at: new Date().toISOString(),
      };
      // Build new living_truth for person_a
      const newTruthA = {
        status: 'needs_decision',
        confidence: combinedScore,
        review: reviewData,
        source: 'community_observer',
        updated_at: new Date().toISOString(),
      };
      // For person_b, swap the matched_person_id
      const reviewDataB = { ...reviewData, matched_person_id: person_a };
      const newTruthB = {
        status: 'needs_decision',
        confidence: combinedScore,
        review: reviewDataB,
        source: 'community_observer',
        updated_at: new Date().toISOString(),
      };

      await client.query(
        `UPDATE people SET living_truth = $1 WHERE id = $2 AND organization_id = $3`,
        [newTruthA, person_a, orgId]
      );
      await client.query(
        `UPDATE people SET living_truth = $1 WHERE id = $2 AND organization_id = $3`,
        [newTruthB, person_b, orgId]
      );
      console.log(`[ARIA] Pair ${person_a} ↔ ${person_b} flagged as needs_review (score ${combinedScore.toFixed(0)}, types: ${Array.from(typeSet).join(', ')})`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ARIA] processPairObservations error:', err);
    throw err;
  } finally {
    client.release();
  }

  // Log top 50 pair suspicions
  if (decisions.length > 0) {
    const sorted = decisions.sort((a, b) => b.combinedScore - a.combinedScore);
    const top = sorted.slice(0, 50);
    console.log('[ARIA] Top 50 identity pair suspicions (score ≥ 85):');
    top.forEach((d, idx) => {
      console.log(`  ${idx+1}. ${d.person_a} ↔ ${d.person_b}: score=${d.combinedScore.toFixed(0)}, types=${d.types.join(', ')}, obs=${d.count}`);
    });
  }
}
