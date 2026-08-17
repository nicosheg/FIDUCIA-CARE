// pages/api/identity/review-action.js
import pool from '../../../lib/db';

const MIN_MERGE_SCORE = 70; // safety threshold

async function mergePeople(client, survivorId, mergedId, orgId, resolvedBy, action, evidence, reasons, score, ariaDecision) {
  // 1. Verify both are active and not already merged
  const check = await client.query(
    `SELECT status, living_truth FROM people WHERE id = ANY($1) AND organization_id = $2`,
    [[survivorId, mergedId], orgId]
  );
  if (check.rows.length !== 2) throw new Error('One or both persons not found');
  for (const row of check.rows) {
    if (row.status === 'merged') throw new Error(`Person ${row.id} is already merged`);
    if (row.living_truth?.merged_into) throw new Error(`Person ${row.id} is already merged`);
  }

  // 2. Move foreign keys – use the correct column names
  // participation_records uses person_id (created with that name)
  await client.query(
    `UPDATE participation_records SET person_id = $1 WHERE person_id = $2 AND organization_id = $3`,
    [survivorId, mergedId, orgId]
  );
  // timeline_events uses people_id (not person_id)
  await client.query(
    `UPDATE timeline_events SET people_id = $1 WHERE people_id = $2 AND organization_id = $3`,
    [survivorId, mergedId, orgId]
  );
  // person_aliases uses person_id
  await client.query(
    `UPDATE person_aliases SET person_id = $1 WHERE person_id = $2 AND organization_id = $3`,
    [survivorId, mergedId, orgId]
  );
  // Add more tables as needed

  // 3. Mark merged person
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

  // 5. Update merged person living_truth
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
  // Ensure both are active
  const check = await client.query(
    `SELECT status FROM people WHERE id = ANY($1) AND organization_id = $2`,
    [[personId, matchedId], orgId]
  );
  if (check.rows.length !== 2) throw new Error('One or both persons not found');
  for (const row of check.rows) {
    if (row.status === 'merged') throw new Error(`Person ${row.id} is already merged`);
  }

  const keepTruth = (id, otherId) => ({
    status: 'alive',
    confidence: 100,
    resolved_by_human: true,
    resolved_at: new Date().toISOString(),
    resolved_by: resolvedBy,
    action_taken: action,
    source: 'human_resolved',
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
      `SELECT living_truth, status FROM people WHERE id = $1 AND organization_id = $2`,
      [person_id, orgId]
    );
    const matchedRes = await client.query(
      `SELECT living_truth, status FROM people WHERE id = $1 AND organization_id = $2`,
      [matched_person_id, orgId]
    );
    if (personRes.rows.length === 0 || matchedRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Person not found' });
    }
    const personLT = personRes.rows[0].living_truth;
    const matchedLT = matchedRes.rows[0].living_truth;
    const personStatus = personRes.rows[0].status;
    const matchedStatus = matchedRes.rows[0].status;

    // Safety: cannot merge if either is already merged
    if (personStatus === 'merged' || matchedStatus === 'merged') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'One of the persons is already merged' });
    }

    // Extract review info
    const review = personLT?.review || matchedLT?.review || {};
    const score = review.score || 0;
    const reasons = review.reasons || [];
    const evidence = review.evidence || [];
    const ariaDecision = personLT?.status || 'needs_decision';

    // ---- SAFETY CHECKS ----
    if (action === 'merge') {
      if (score < MIN_MERGE_SCORE) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Merge blocked: confidence score (${score}) below minimum (${MIN_MERGE_SCORE}). Please review manually.`
        });
      }
      if (reasons.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Merge blocked: no evidence provided. Cannot merge without evidence.' });
      }
    }

    // ---- Store learning record (audit) ----
    await client.query(
      `INSERT INTO aria_learning
       (organization_id, source_person_id, candidate_person_id, aria_score, aria_decision, human_decision, reviewed_at, resolved_by, evidence, reasons)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)`,
      [orgId, person_id, matched_person_id, score, ariaDecision, action, resolver, JSON.stringify(evidence), JSON.stringify(reasons)]
    );

    // ---- Perform action ----
    if (action === 'merge') {
      await mergePeople(client, person_id, matched_person_id, orgId, resolver, action, evidence, reasons, score, ariaDecision);
    } else {
      await keepSeparate(client, person_id, matched_person_id, orgId, resolver, action, evidence, reasons, score, ariaDecision);
    }

    // ---- Resolution: Close engagement cases ----
    await client.query(
      `UPDATE engagement_cases SET resolved = true, updated_at = NOW()
       WHERE person_id = ANY($1) AND organization_id = $2 AND resolved = false`,
      [[person_id, matched_person_id], orgId]
    );

    // ---- ⚠️ TEMPORARILY DISABLED: tables missing ----
    // The following tables are not yet created in the database.
    // They will be re-enabled once the schema is updated.

    /*
    // Record outcome
    await client.query(
      `INSERT INTO engagement_outcomes (organization_id, person_id, outcome_type, outcome_score)
       VALUES ($1, $2, $3, $4)`,
      [orgId, person_id, action === 'merge' ? 'merged' : 'kept_separate', score]
    );
    await client.query(
      `INSERT INTO engagement_outcomes (organization_id, person_id, outcome_type, outcome_score)
       VALUES ($1, $2, $3, $4)`,
      [orgId, matched_person_id, action === 'merge' ? 'merged' : 'kept_separate', score]
    );

    // Close recommendations
    await client.query(
      `UPDATE recommendations SET status = 'completed', updated_at = NOW()
       WHERE person_id = ANY($1) AND organization_id = $2 AND status = 'pending'`,
      [[person_id, matched_person_id], orgId]
    );

    // Create journey events
    await client.query(
      `INSERT INTO person_journey_events (organization_id, person_id, event_type, event_data)
       VALUES ($1, $2, 'IDENTITY_MERGED', $3)`,
      [orgId, person_id, JSON.stringify({ merged_with: matched_person_id, score })]
    );
    await client.query(
      `INSERT INTO person_journey_events (organization_id, person_id, event_type, event_data)
       VALUES ($1, $2, 'IDENTITY_MERGED_INTO', $3)`,
      [orgId, matched_person_id, JSON.stringify({ merged_into: person_id, score })]
    );
    */

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
