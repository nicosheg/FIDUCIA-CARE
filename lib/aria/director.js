// lib/aria/director.js
import { resolveIdentities } from '../identityResolver';
import pool from '../db';

/**
 * Handle a scan completion event.
 * - Runs identity resolution on extracted people.
 * - Updates people.living_truth for existing matches.
 * - Leaves orphaned observations in scan_jobs.result for human review.
 */
export async function handleScanEvent(extractedPeople, orgId, jobId) {
  // 1. Resolve identities
  const { needsReview, resolvedPeople } = await resolveIdentities(extractedPeople, orgId, jobId);

  // 2. For each resolved person (alive or auto‑saved), update living_truth in people
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of needsReview) {
      if (item.resolved && item.resolved_person_id) {
        // For alive/auto‑confirmed, set living_truth to settled (null)
        // but if status is 'alive' and not resolved? Actually 'alive' is resolved.
        // We'll set living_truth based on the status for those that are not fully resolved.
        // For now, we only store state for items that are not resolved (needs decision or conflict)
        // or for those that are alive but we want to keep the light.
        // We'll decide: if status is 'alive' and resolved, we can store a lightweight state.
        // But to keep it simple, we'll store for all items that are not fully settled.
        if (item.status !== 'alive' || (item.status === 'alive' && !item.resolved)) {
          // Actually, 'alive' means auto‑saved and resolved. So we might not need to store it.
          // However, we may want to keep a light for 'alive' items as well. We'll store it.
          const livingTruth = {
            status: item.status,
            candidates: item.candidates,
            confidence: item.confidence,
            updated_at: new Date().toISOString(),
          };
          await client.query(
            `UPDATE people SET living_truth = $1 WHERE id = $2 AND organization_id = $3`,
            [livingTruth, item.resolved_person_id, orgId]
          );
        } else if (item.resolved && item.status === 'alive') {
          // For alive, we can optionally set a subtle state, but we could also clear it.
          // We'll clear it for now, but we can revisit.
          await client.query(
            `UPDATE people SET living_truth = NULL WHERE id = $1 AND organization_id = $2`,
            [item.resolved_person_id, orgId]
          );
        }
      }
    }

    // For unresolved items (needs_decision, conflict), we also need to update the person
    // if they have a candidate_id (i.e., they were matched to a person but need decision).
    // In that case, we should have a resolved_person_id as well? Not necessarily.
    // We'll handle the case where there is a candidate but not resolved.
    for (const item of needsReview) {
      if (!item.resolved && item.candidate_ids && item.candidate_ids.length > 0) {
        // We have a candidate but need human decision.
        const livingTruth = {
          status: item.status,
          candidates: item.candidates,
          confidence: item.confidence,
          updated_at: new Date().toISOString(),
        };
        // If there is a primary candidate, we can store on that person
        // but if there are multiple, we might not know which person to attach to.
        // For conflict, we need to attach to multiple? That's tricky.
        // We'll store on the first candidate for now, but we should consider storing
        // a separate review queue for conflicts. However, we'll defer that.
        // For simplicity, we'll store on the first candidate if exists.
        const primaryId = item.candidate_ids[0];
        if (primaryId) {
          await client.query(
            `UPDATE people SET living_truth = $1 WHERE id = $2 AND organization_id = $3`,
            [livingTruth, primaryId, orgId]
          );
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ARIA Director error:', err);
    throw err;
  } finally {
    client.release();
  }

  // Return the same data for the scan job result (already stored in visionProcessor)
  return { needsReview, resolvedPeople };
}
