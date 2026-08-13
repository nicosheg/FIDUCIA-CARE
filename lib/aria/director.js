// lib/aria/director.js
import pool from '../db';
import { resolveIdentities } from '../identityResolver';

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
    // Only 'alive' with a best candidate goes to resolvedPeople
    if (dec.status === 'alive' && dec.best_candidate_id) {
      resolvedPeople.push({
        name: dec.extracted_name,
        phone: dec.extracted_phone,
        resolved_person_id: dec.best_candidate_id,
        status: dec.status,
        confidence: dec.confidence,
      });
    }

    // All non‑'new' items go to needsReview
    if (dec.status !== 'new') {
      needsReview.push({
        ...dec,
        resolved: false,
      });
    }
  }

  return {
    needsReview,
    resolvedPeople,
  };
            }
