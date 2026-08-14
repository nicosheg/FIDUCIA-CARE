// lib/aria/director.js
import pool from '../db';
import { resolveIdentities } from '../identityResolver';
import { generateDuplicatePhoneObservations } from './observers/duplicatePhoneObserver';
import { generateSimilarNameObservations } from './observers/similarNameObserver';
import { generatePhoneSimilarityObservations } from './observers/phoneSimilarityObserver';

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

export async function initializeCommunity(orgId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Migrate canonical → alive
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

    // Set baseline for null living_truth
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

  // Run all observers
  const allObservations = [
    ...await generateDuplicatePhoneObservations(orgId),
    ...await generateSimilarNameObservations(orgId),
    ...await generatePhoneSimilarityObservations(orgId),
  ];
  await processObservations(orgId, allObservations);
}

async function processObservations(orgId, observations) {
  if (observations.length === 0) {
    console.log('[ARIA] No observations to process.');
    return;
  }

  const evidenceMap = new Map();
  for (const obs of observations) {
    if (!evidenceMap.has(obs.person_id)) {
      evidenceMap.set(obs.person_id, []);
    }
    evidenceMap.get(obs.person_id).push(obs);
  }

  const client = await pool.connect();
  const decisionsMade = [];
  try {
    await client.query('BEGIN');

    for (const [personId, evList] of evidenceMap) {
      const current = await client.query(
        `SELECT living_truth FROM people WHERE id = $1 AND organization_id = $2`,
        [personId, orgId]
      );
      const lt = current.rows[0]?.living_truth;
      if (!lt) continue;

      const status = lt.status;
      const source = lt.source;
      const isEligible = (status === 'canonical') || (status === 'alive' && source === 'canonical_record');
      if (!isEligible) continue;

      // Aggregate by type
      const typeConfidences = {};
      let totalConfidence = 0;
      const evidenceArray = [];
      for (const ev of evList) {
        totalConfidence += ev.confidence;
        evidenceArray.push(ev.evidence);
        if (!typeConfidences[ev.type]) typeConfidences[ev.type] = [];
        typeConfidences[ev.type].push(ev.confidence);
      }

      const count = evList.length;
      const uniqueTypes = Object.keys(typeConfidences).length;
      const averageConfidence = totalConfidence / count;

      // Boost: +5 per unique type, +2 per additional evidence (cap 100)
      let combinedScore = averageConfidence + (uniqueTypes - 1) * 5 + (count - uniqueTypes) * 2;
      combinedScore = Math.min(100, combinedScore);

      decisionsMade.push({
        personId,
        combinedScore,
        count,
        uniqueTypes,
        types: Object.keys(typeConfidences),
      });

      if (combinedScore >= 85) {
        const newTruth = {
          status: 'needs_decision',
          confidence: combinedScore,
          evidence: evidenceArray,
          source: 'community_observer',
          updated_at: new Date().toISOString(),
        };
        await client.query(
          `UPDATE people SET living_truth = $1 WHERE id = $2 AND organization_id = $3`,
          [newTruth, personId, orgId]
        );
        console.log(`[ARIA] Updated person ${personId} to needs_decision (combined ${combinedScore.toFixed(0)})`);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[ARIA] processObservations error:', err);
    throw err;
  } finally {
    client.release();
  }

  // ── Debug: Log top 50 strongest suspicions ──
  if (decisionsMade.length > 0) {
    const sorted = decisionsMade.sort((a, b) => b.combinedScore - a.combinedScore);
    const top = sorted.slice(0, 50);
    console.log('[ARIA] Top 50 identity suspicions (combined score >= 85):');
    top.forEach((d, idx) => {
      console.log(`  ${idx+1}. Person ${d.personId}: score=${d.combinedScore.toFixed(0)}, types=${d.types.join(', ')}, obs=${d.count}`);
    });
  }
        }
