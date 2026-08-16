// lib/aria/outcomeEngine.js
import pool from '../db';

/**
 * Record an engagement outcome for a person.
 */
export async function recordOutcome(orgId, personId, outcomeType, outcomeScore = null, actionId = null) {
    await pool.query(
        `INSERT INTO engagement_outcomes (organization_id, person_id, action_id, outcome_type, outcome_score)
         VALUES ($1, $2, $3, $4, $5)`,
        [orgId, personId, actionId, outcomeType, outcomeScore]
    );
}

/**
 * Get outcomes for a person.
 */
export async function getOutcomesForPerson(orgId, personId) {
    const res = await pool.query(
        `SELECT * FROM engagement_outcomes
         WHERE organization_id = $1 AND person_id = $2
         ORDER BY created_at DESC`,
        [orgId, personId]
    );
    return res.rows;
}

/**
 * Get aggregate outcome stats for an organization.
 */
export async function getOutcomeStats(orgId) {
    const res = await pool.query(
        `SELECT outcome_type, COUNT(*) as count
         FROM engagement_outcomes
         WHERE organization_id = $1
         GROUP BY outcome_type
         ORDER BY count DESC`,
        [orgId]
    );
    return res.rows;
}
