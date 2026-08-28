// pages/api/identity/review-action.js
import pool from '../../../lib/db';
import { withAdmin } from '../../../lib/apiHelpers';

const MIN_MERGE_SCORE = 70;

async function mergePeople(
    client,
    survivorId,
    mergedId,
    orgId,
    resolvedBy,
    action
) {
    // Both people must belong to this organization and neither may already be merged.
    const check = await client.query(
        `SELECT id, status, living_truth
         FROM people
         WHERE id = ANY($1)
           AND organization_id = $2`,
        [[survivorId, mergedId], orgId]
    );

    if (check.rows.length !== 2) {
        throw new Error('One or both persons not found');
    }

    for (const row of check.rows) {
        if (row.status === 'merged') {
            throw new Error(`Person ${row.id} is already merged`);
        }

        if (row.living_truth?.merged_into) {
            throw new Error(`Person ${row.id} is already merged`);
        }
    }

    /*
     * Preserve historical participation under the surviving identity.
     * The participation schema uses person_id as the identity reference.
     */
    await client.query(
        `UPDATE participation_records
         SET person_id = $1
         WHERE person_id = $2
           AND organization_id = $3`,
        [survivorId, mergedId, orgId]
    );

    // Preserve historical timeline events under the surviving identity.
    await client.query(
        `UPDATE timeline_events
         SET people_id = $1
         WHERE people_id = $2
           AND organization_id = $3`,
        [survivorId, mergedId, orgId]
    );

    // Preserve confirmed identity aliases.
    await client.query(
        `UPDATE person_aliases
         SET person_id = $1
         WHERE person_id = $2
           AND organization_id = $3`,
        [survivorId, mergedId, orgId]
    );

    // Mark the duplicate identity as merged.
    await client.query(
        `UPDATE people
         SET status = 'merged'
         WHERE id = $1
           AND organization_id = $2`,
        [mergedId, orgId]
    );

    // Record the canonical survivor state.
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
        `UPDATE people
         SET living_truth = $1
         WHERE id = $2
           AND organization_id = $3`,
        [survivorTruth, survivorId, orgId]
    );

    // Keep an explicit historical record on the merged identity.
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
        `UPDATE people
         SET living_truth = $1
         WHERE id = $2
           AND organization_id = $3`,
        [mergedTruth, mergedId, orgId]
    );
}

async function keepSeparate(
    client,
    personId,
    matchedId,
    orgId,
    resolvedBy,
    action
) {
    const check = await client.query(
        `SELECT id, status
         FROM people
         WHERE id = ANY($1)
           AND organization_id = $2`,
        [[personId, matchedId], orgId]
    );

    if (check.rows.length !== 2) {
        throw new Error('One or both persons not found');
    }

    for (const row of check.rows) {
        if (row.status === 'merged') {
            throw new Error(`Person ${row.id} is already merged`);
        }
    }

    const resolvedAt = new Date().toISOString();

    const keepTruth = (otherId) => ({
        status: 'alive',
        confidence: 100,
        resolved_by_human: true,
        resolved_at: resolvedAt,
        resolved_by: resolvedBy,
        action_taken: action,
        source: 'human_resolved',
        reviewed_with: otherId,
    });

    await client.query(
        `UPDATE people
         SET living_truth = $1
         WHERE id = $2
           AND organization_id = $3`,
        [keepTruth(matchedId), personId, orgId]
    );

    await client.query(
        `UPDATE people
         SET living_truth = $1
         WHERE id = $2
           AND organization_id = $3`,
        [keepTruth(personId), matchedId, orgId]
    );
}

async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const {
        person_id,
        matched_person_id,
        action,
        resolved_by,
    } = req.body;

    if (!person_id || !matched_person_id || !action) {
        return res.status(400).json({
            error: 'Missing required fields',
        });
    }

    if (person_id === matched_person_id) {
        return res.status(400).json({
            error: 'A person cannot be matched with themselves',
        });
    }

    if (!['merge', 'keep_separate'].includes(action)) {
        return res.status(400).json({
            error: 'Invalid action',
        });
    }

    const orgId = req.org.id;
    const resolver = resolved_by || req.user?.name || 'system';
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Fetch both identities within the authenticated organization.
        const personRes = await client.query(
            `SELECT living_truth, status
             FROM people
             WHERE id = $1
               AND organization_id = $2`,
            [person_id, orgId]
        );

        const matchedRes = await client.query(
            `SELECT living_truth, status
             FROM people
             WHERE id = $1
               AND organization_id = $2`,
            [matched_person_id, orgId]
        );

        if (
            personRes.rows.length === 0 ||
            matchedRes.rows.length === 0
        ) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                error: 'Person not found',
            });
        }

        const personLT = personRes.rows[0].living_truth;
        const matchedLT = matchedRes.rows[0].living_truth;
        const personStatus = personRes.rows[0].status;
        const matchedStatus = matchedRes.rows[0].status;

        if (
            personStatus === 'merged' ||
            matchedStatus === 'merged'
        ) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'One of the persons is already merged',
            });
        }

        const review =
            personLT?.review ||
            matchedLT?.review ||
            {};

        const score = review.score || 0;
        const reasons = review.reasons || [];
        const evidence = review.evidence || [];
        const ariaDecision =
            personLT?.status ||
            matchedLT?.status ||
            'needs_decision';

        // High-confidence merge requires evidence.
        if (action === 'merge') {
            if (score < MIN_MERGE_SCORE) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Merge blocked: confidence score (${score}) below minimum (${MIN_MERGE_SCORE}). Please review manually.`,
                });
            }

            if (reasons.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: 'Merge blocked: no evidence provided. Cannot merge without evidence.',
                });
            }
        }

        // Store the human identity-resolution decision for future learning.
        await client.query(
            `INSERT INTO aria_learning
             (
                organization_id,
                source_person_id,
                candidate_person_id,
                aria_score,
                aria_decision,
                human_decision,
                reviewed_at,
                resolved_by,
                evidence,
                reasons
             )
             VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,$8,$9)`,
            [
                orgId,
                person_id,
                matched_person_id,
                score,
                ariaDecision,
                action,
                resolver,
                JSON.stringify(evidence),
                JSON.stringify(reasons),
            ]
        );

        if (action === 'merge') {
            await mergePeople(
                client,
                person_id,
                matched_person_id,
                orgId,
                resolver,
                action
            );
        } else {
            await keepSeparate(
                client,
                person_id,
                matched_person_id,
                orgId,
                resolver,
                action
            );
        }

        // Identity resolution closes unresolved engagement cases for both identities.
        await client.query(
            `UPDATE engagement_cases
             SET resolved = true,
                 updated_at = NOW()
             WHERE person_id = ANY($1)
               AND organization_id = $2
               AND resolved = false`,
            [[person_id, matched_person_id], orgId]
        );

        await client.query('COMMIT');

        return res.status(200).json({
            success: true,
            action,
        });
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error(
                'Identity review rollback failed:',
                rollbackError
            );
        }

        console.error('Review action error:', err);

        return res.status(500).json({
            error: err.message,
        });
    } finally {
        client.release();
    }
}

export default withAdmin(handler);
