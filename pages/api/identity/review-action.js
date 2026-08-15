// pages/api/identity/review-action.js
import pool from '../../../lib/db';

/**
 * Merge strategy:
 * - Survivor = person_id (the one being acted upon)
 * - Move all data from matched_person_id to survivor:
 *   - attendance_records (people_id)
 *   - timeline_events (people_id)
 *   - person_aliases (person_id)
 *   - any other related tables
 * - Mark matched_person_id as status = 'merged'
 * - Update both living_truth with resolution info
 * - Store audit in aria_learning
 */
async function mergePeople(client, survivorId, mergedId, orgId, resolvedBy, action, evidence, reasons, score, ariaDecision) {
  // 1. Update all foreign keys to point to survivor
  await client.query(
    `UPDATE attendance_records SET people_id = $1 WHERE people_id = $2 AND organization_id = $3`,
    [survivorId, mergedId, orgId]
  );
  await client.query(
    `UPDATE timeline_events SET people_id = $1 WHERE people_id = $2 AND organization_id = $3`,
    [survivorId, mergedId, orgId]
  );
  await client.query(
    `UPDATE person_aliases SET person_id = $1 WHERE person_id = $2 AND organization_id = $3`,
    [survivorId, mergedId, orgId]
  );
  // Add more tables as needed (e.g., care_queue, etc.)

  // 2. Merge aliases (optional, but we already moved them)

  // 3. Mark merged person as inactive/merged
  await client.query(
    `UPDATE people SET status = 'merged', merged_into_id = $1 WHERE id = $2 AND organization_id = $3`,
    [survivorId, mergedId, orgId]
  );

  // 4. Update survivor living_truth
  const survivorTruth = {
    status: 'alive',
    confidence: 100,
    resolved_by_human: true,
    resolved_at: new Date().toISOString(),
    resolved_by: resolvedBy,
    action_taken: action,
    merged_from: mergedId,
    source: 'human_resolved',
  };
  await client.query(
    `UPDATE people SET living_truth = $1 WHERE id = $2 AND organization_id = $3`,
    [survivorTruth, survivorId, orgId]
  );

  // 5. Update merged person living_truth (keep a reference)
  const mergedTruth = {
    status: 'merged',
    merged_into: survivorId,
    resolved_by_human: true,
    resolved_at: new Date().toISOString(),
    resolved_by: resolvedBy,
    action_taken: action,
    source: 'human_resolved',
  };
  await client.query(
    `UPDATE people SET living_truth = $1 WHERE id = $2 AND organization_id = $3`,
    [mergedTruth, mergedId, orgId]
  );
}

async function keepSeparate(client, personId, matchedId, orgId, resolvedBy, action, evidence, reasons, score, ariaDecision) {
  // Just mark both as alive, clear review, but keep a record of human decision
  const keepTruth = (id, otherId) => ({
    status: 'alive',
    confidence: 100,
    resolved_by_human: true,
    resolved_at: new Date().toISOString(),
    resolved_by: resolvedBy,
    action_taken: action,
    source: 'human_resolved',
    // Optionally keep reference to the other
    reviewed_with: otherId,
  });

  await client.query(
    `UPDATE people SET living_truth = $1 WHERE id = $2 AND organization_id = $3`,
    [keepTruth(personId, matchedId), personId, orgId]
  );
  await client.query(
    `UPDATE people SET living_truth = $1 WHERE id = $2 AND organization_id = $3`,
    [keepTruth(matchedId, personId), matchedId, orgId]
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { person_id, matched_person_id, action, resolved_by } = req.body;
  if (!person_id || !matched_person_id || !action) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!['merge', 'keep_separate'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  const orgId = req.query.organization_id || 'demo-org';
  const resolver = resolved_by || 'system';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch current living_truth for both
    const personRes = await client.query(
      `SELECT living_truth FROM people WHERE id = $1 AND organization_id = $2`,
      [person_id, orgId]
    );
    const matchedRes = await client.query(
      `SELECT living_truth FROM people WHERE id = $1 AND organization_id = $2`,
      [matched_person_id, orgId]
    );
    const personLT = personRes.rows[0]?.living_truth;
    const matchedLT = matchedRes.rows[0]?.living_truth;
    if (!personLT || !matchedLT) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Person not found' });
    }

    // Extract review info (from person)
    const review = personLT.review || {};
    const score = review.score || 0;
    const reasons = review.reasons || [];
    const evidence = review.evidence || [];
    const ariaDecision = personLT.status || 'needs_decision';

    // Store audit in aria_learning (before modifying)
    await client.query(
      `INSERT INTO aria_learning 
       (organization_id, source_person_id, candidate_person_id, aria_score, aria_decision, human_decision, reviewed_at, resolved_by, evidence, reasons)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)`,
      [orgId, person_id, matched_person_id, score, ariaDecision, action, resolver, JSON.stringify(evidence), JSON.stringify(reasons)]
    );

    // Perform action
    if (action === 'merge') {
      await mergePeople(client, person_id, matched_person_id, orgId, resolver, action, evidence, reasons, score, ariaDecision);
    } else {
      await keepSeparate(client, person_id, matched_person_id, orgId, resolver, action, evidence, reasons, score, ariaDecision);
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true, action });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Review action error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
     }
