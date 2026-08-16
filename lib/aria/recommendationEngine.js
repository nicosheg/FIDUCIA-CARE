// lib/aria/recommendationEngine.js
import pool from '../db';
import { createCareAction } from './careActions';
import { getOrgSettings } from './organizationSettings';

/**
 * Generate recommendations for an organization.
 * - High‑risk cases (urgent_action_required) → priority 100, due in 2 days.
 * - At‑risk cases → priority 70, due in 3 days.
 * - New people → priority 50, due in 1 day.
 * - Returning people → priority 40, due in 1 day.
 */
export async function generateRecommendations(orgId) {
    const settings = await getOrgSettings(orgId);
    const cycleDays = settings.engagement_cycle_days;
    const threshold3 = settings.risk_threshold_3 * cycleDays;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Critical: urgent_action_required
        const urgentRes = await client.query(
            `SELECT ec.person_id, p.first_name, ec.inactivity_streak
             FROM engagement_cases ec
             JOIN people p ON ec.person_id = p.id
             WHERE ec.organization_id = $1 AND ec.engagement_status = 'urgent_action_required' AND ec.resolved = false
             ORDER BY ec.inactivity_streak DESC`,
            [orgId]
        );
        for (const row of urgentRes.rows) {
            const text = `Follow up with ${row.first_name} (inactive for ${row.inactivity_streak} weeks)`;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 2);
            await client.query(
                `INSERT INTO recommendations (organization_id, person_id, action_type, recommendation_text, priority, status, due_date)
                 VALUES ($1, $2, 'follow_up', $3, 100, 'pending', $4)`,
                [orgId, row.person_id, text, dueDate]
            );
        }

        // 2. At‑risk
        const atRiskRes = await client.query(
            `SELECT ec.person_id, p.first_name, ec.inactivity_streak
             FROM engagement_cases ec
             JOIN people p ON ec.person_id = p.id
             WHERE ec.organization_id = $1 AND ec.engagement_status = 'at_risk' AND ec.resolved = false
             ORDER BY ec.inactivity_streak DESC`,
            [orgId]
        );
        for (const row of atRiskRes.rows) {
            const text = `Check on ${row.first_name} (inactive for ${row.inactivity_streak} weeks)`;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 3);
            await client.query(
                `INSERT INTO recommendations (organization_id, person_id, action_type, recommendation_text, priority, status, due_date)
                 VALUES ($1, $2, 'check_in', $3, 70, 'pending', $4)`,
                [orgId, row.person_id, text, dueDate]
            );
        }

        // 3. New people (first_time)
        const newRes = await client.query(
            `SELECT em.person_id, p.first_name
             FROM engagement_metrics em
             JOIN people p ON em.person_id = p.id
             WHERE em.organization_id = $1 AND em.engagement_status = 'first_time' AND em.last_seen >= NOW() - INTERVAL '7 days'
             ORDER BY em.last_seen DESC LIMIT 10`,
            [orgId]
        );
        for (const row of newRes.rows) {
            const text = `Welcome ${row.first_name} (new person)`;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 1);
            await client.query(
                `INSERT INTO recommendations (organization_id, person_id, action_type, recommendation_text, priority, status, due_date)
                 VALUES ($1, $2, 'welcome', $3, 50, 'pending', $4)`,
                [orgId, row.person_id, text, dueDate]
            );
        }

        // 4. Returning people
        const returnRes = await client.query(
            `SELECT em.person_id, p.first_name
             FROM engagement_metrics em
             JOIN people p ON em.person_id = p.id
             WHERE em.organization_id = $1 AND em.engagement_status = 'returning' AND em.last_seen >= NOW() - INTERVAL '7 days'
             ORDER BY em.last_seen DESC LIMIT 10`,
            [orgId]
        );
        for (const row of returnRes.rows) {
            const text = `Welcome back ${row.first_name}`;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 1);
            await client.query(
                `INSERT INTO recommendations (organization_id, person_id, action_type, recommendation_text, priority, status, due_date)
                 VALUES ($1, $2, 'welcome_back', $3, 40, 'pending', $4)`,
                [orgId, row.person_id, text, dueDate]
            );
        }

        await client.query('COMMIT');
        console.log(`[Recommendations] Generated for org ${orgId}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Recommendations] Error generating:', err);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Get all pending recommendations for an organization.
 */
export async function getPendingRecommendations(orgId) {
    const res = await pool.query(
        `SELECT r.*, p.first_name, p.phone
         FROM recommendations r
         JOIN people p ON r.person_id = p.id
         WHERE r.organization_id = $1 AND r.status = 'pending'
         ORDER BY r.priority DESC, r.due_date ASC, r.created_at ASC`,
        [orgId]
    );
    return res.rows;
}

/**
 * Accept a recommendation – creates a care action and marks as accepted.
 */
export async function acceptRecommendation(recId, assignedTo = null) {
    const res = await pool.query(
        `UPDATE recommendations
         SET status = 'accepted', assigned_to = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING organization_id, person_id, action_type, notes, due_date, recommendation_text`,
        [assignedTo, recId]
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    // Create a care action
    await createCareAction(
        r.organization_id,
        r.person_id,
        r.action_type,
        assignedTo,
        r.notes || r.recommendation_text,
        r.due_date
    );
    return r;
}

/**
 * Dismiss a recommendation.
 */
export async function dismissRecommendation(recId) {
    await pool.query(
        `UPDATE recommendations SET status = 'dismissed', updated_at = NOW() WHERE id = $1`,
        [recId]
    );
}

/**
 * Mark a recommendation as completed (e.g., after action is done).
 */
export async function completeRecommendation(recId, completedAt = null) {
    await pool.query(
        `UPDATE recommendations SET status = 'completed', completed_at = $1, updated_at = NOW() WHERE id = $2`,
        [completedAt || new Date(), recId]
    );
              }
