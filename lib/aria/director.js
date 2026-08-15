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
 */
export async function initializeCommunity(orgId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Migrate canonical → alive (source: canonical_record) ──
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
          `UPDATE people SET living_truth = $1 WHERE id = $2 AND organization_id = $3`,
          [newTruth, row.id, orgId]
        );
      }
      console.log(`[ARIA] Migrated ${canonicalRes.rows.length} canonical records to alive.`);
    }

    // ── Set baseline alive for any null living_truth ──
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
        `UPDATE people SET living_truth = $1 WHERE id = ANY($2) AND organization_id = $3`,
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

  // ── Run observers ──
  const duplicateObs = await generateDuplicatePhoneObservations(orgId);
  console.log(`[ARIA] Duplicate phone observations: ${duplicateObs.length}`);

  const similarNameObs = await generateSimilarNameObservations(orgId);
  console.log(`[ARIA] Similar name observations: ${similarNameObs.length}`);

  const similarPhoneObs = await generatePhoneSimilarityObservations(orgId);
  console.log(`[ARIA] Similar phone observations: ${similarPhoneObs.length}`);

  const allObservations = [
    ...duplicateObs,
    ...similarNameObs,
    ...similarPhoneObs,
  ];
  console.log(`[ARIA] Total observations: ${allObservations.length}`);

  // ── DEBUG: print first 20 observations to inspect matched_person_id ──
  console.log('[ARIA DEBUG] Sample observations:');
  allObservations.slice(0, 20).forEach((obs, idx) => {
    const matched = obs.evidence.matched_person_id || obs.evidence.other_person_ids?.[0] || 'N/A';
    console.log(`  ${idx+1}: type=${obs.type}, person_id=${obs.person_id}, matched=${matched}`);
  });

  await processPairObservations(orgId, allObservations);
}

/**
 * Process observations as pairs with strict evidence requirements.
 * 
 * Eligibility rules:
 * - Must have at least duplicate_phone OR
 * - Must have at least two different types (e.g., similar_name + similar_phone) OR
 * - (similar_name alone or similar_phone alone are not enough)
 */
async function processPairObservations(orgId, observations) {
  if (observations.length === 0) {
    console.log('[ARIA] No observations to process.');
    return;
  }

  // Group by pair using string ordering (safe for UUIDs)
  const pairMap = new Map();
  for (const obs of observations) {
    if (!obs.person_id) continue;

    let otherIds = [];
    if (obs.evidence.matched_person_id) {
      otherIds = [obs.evidence.matched_person_id];
    } else if (obs.evidence.other_person_ids) {
      otherIds = obs.evidence.other_person_ids;
    }

    for (const otherId of otherIds) {
      if (!otherId) continue;
      const a = obs.person_id;
      const b = otherId;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, { person_a: a, person_b: b, observations: [] });
      }
      pairMap.get(key).observations.push(obs);
    }
  }

  console.log(`[ARIA] Pair count: ${pairMap.size}`);

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

      // Check eligibility – both must still be in baseline state
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

      // ---- Determine types and confidence ----
      const typeSet = new Set();
      let totalConfidence = 0;
      const evidenceArray = [];
      for (const obs of obsList) {
        totalConfidence += obs.confidence;
        evidenceArray.push(obs.evidence);
        typeSet.add(obs.type);
      }
      const count = obsList.length;
      const uniqueTypes = typeSet.size;
      const averageConfidence = totalConfidence / count;

      // ---- Apply evidence requirements ----
      const hasDuplicatePhone = typeSet.has('duplicate_phone');
      const hasSimilarName = typeSet.has('similar_name');
      const hasSimilarPhone = typeSet.has('similar_phone');

      // similar_phone alone is never enough
      if (hasSimilarPhone && !hasDuplicatePhone && !hasSimilarName && uniqueTypes === 1) {
        console.log(`[ARIA] Skipping pair ${person_a} ↔ ${person_b}: similar_phone alone not sufficient`);
        continue;
      }

      // similar_name alone is not enough (unless combined)
      if (hasSimilarName && !hasDuplicatePhone && !hasSimilarPhone && uniqueTypes === 1) {
        console.log(`[ARIA] Skipping pair ${person_a} ↔ ${person_b}: similar_name alone not sufficient`);
        continue;
      }

      // Compute combined score
      let combinedScore = averageConfidence + (uniqueTypes - 1) * 5 + (count - uniqueTypes) * 2;
      combinedScore = Math.min(100, combinedScore);

      if (hasDuplicatePhone && combinedScore < 85) {
        combinedScore = 85;
      }

      if (combinedScore < 85) {
        console.log(`[ARIA] Skipping pair ${person_a} ↔ ${person_b}: score ${combinedScore.toFixed(0)} below threshold`);
        continue;
      }

      decisions.push({ person_a, person_b, combinedScore, types: Array.from(typeSet) });

      // Update both persons with review information
      const reviewData = {
        matched_person_id: person_b,
        evidence: evidenceArray,
        combined_score: combinedScore,
        status: 'needs_review',
        updated_at: new Date().toISOString(),
      };
      const newTruthA = {
        status: 'needs_decision',
        confidence: combinedScore,
        review: reviewData,
        source: 'community_observer',
        updated_at: new Date().toISOString(),
      };
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
      console.log(`[ARIA] Pair ${person_a} ↔ ${person_b} flagged (score ${combinedScore.toFixed(0)}, types: ${Array.from(typeSet).join(', ')})`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ARIA] processPairObservations error:', err);
    throw err;
  } finally {
    client.release();
  }

  if (decisions.length > 0) {
    console.log(`[ARIA] Total pairs flagged: ${decisions.length}`);
  }
    }
