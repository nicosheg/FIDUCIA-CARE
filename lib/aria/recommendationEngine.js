// lib/aria/recommendationEngine.js
import pool from '../db';
import { createCareAction } from './careActions';
import { getOrgSettings } from './organizationSettings';
import { createObservation } from './observationEngine';
import { updatePersonState } from './stateManager';

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
 * @deprecated Use getPendingActions() for ARIA OS integration.
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
 * @deprecated Use approveAction() for ARIA OS integration.
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

// ── ARIA OS INTEGRATION ──

/**
 * Create an aria_action from an observation.
 * This is the primary entry point for ARIA's action planning.
 */
export async function planActionFromObservation({
    organizationId,
    personId = null,
    observationId,
    actionType,
    priority = 'medium',
    actionMetadata = {},
    actionKey = null,
}) {
    if (!organizationId) throw new Error('organizationId required');
    if (!observationId) throw new Error('observationId required');
    if (!actionType) throw new Error('actionType required');

    const key = actionKey || `${organizationId}:${personId || 'global'}:${actionType}:${observationId}:${Date.now()}`;

    const query = `
        INSERT INTO aria_actions (
            organization_id, person_id, observation_id, type, status, priority,
            action_metadata, action_key, proposed_at
        ) VALUES ($1, $2, $3, $4, 'proposed', $5, $6, $7, NOW())
        ON CONFLICT (action_key) DO NOTHING
        RETURNING id
    `;
    const values = [organizationId, personId, observationId, actionType, priority, actionMetadata, key];
    const result = await pool.query(query, values);
    return result.rows[0]?.id || null;
}

/**
 * Approve an action – transitions from proposed to approved.
 * Records who approved it.
 */
export async function approveAction(actionId, approvedByUserId) {
    const result = await pool.query(
        `UPDATE aria_actions
         SET status = 'approved',
             approved_by = $1,
             approved_at = NOW(),
             updated_at = NOW()
         WHERE id = $2 AND status = 'proposed'
         RETURNING *`,
        [approvedByUserId, actionId]
    );
    return result.rows[0] || null;
}

/**
 * Reject an action – transitions to cancelled.
 */
export async function rejectAction(actionId, reason = null) {
    const result = await pool.query(
        `UPDATE aria_actions
         SET status = 'cancelled',
             failure_reason = $1,
             updated_at = NOW()
         WHERE id = $2 AND status IN ('proposed', 'approved')
         RETURNING *`,
        [reason, actionId]
    );
    return result.rows[0] || null;
}

/**
 * Execute an action – transitions from approved to executing → executed.
 * Calls the appropriate service based on action type.
 */
export async function executeAction(actionId, executor) {
    const action = await pool.query(
        `SELECT * FROM aria_actions WHERE id = $1 AND status = 'approved'`,
        [actionId]
    );
    if (action.rows.length === 0) {
        throw new Error('Action not found or not approved');
    }
    const act = action.rows[0];

    // Update to executing
    await pool.query(
        `UPDATE aria_actions SET status = 'executing', updated_at = NOW() WHERE id = $1`,
        [actionId]
    );

    try {
        let outcome = null;

        switch (act.type) {
            case 'SEND_MESSAGE':
                // Call existing messaging service
                // This is a placeholder – you'll integrate with actual messaging
                // For now, we simulate success
                outcome = { success: true, message: 'Message sent (simulated)' };
                break;

            case 'REQUEST_REVIEW':
                // Could call identityService to create review
                outcome = { success: true, message: 'Review requested (simulated)' };
                break;

            case 'ESCALATE':
                // Create notification or alert
                outcome = { success: true, message: 'Escalated (simulated)' };
                break;

            case 'MARK_ATTENDANCE':
                // Call attendanceService
                outcome = { success: true, message: 'Attendance marked (simulated)' };
                break;

            case 'SCAN':
                // Trigger scan
                outcome = { success: true, message: 'Scan triggered (simulated)' };
                break;

            case 'DO_NOTHING':
            default:
                outcome = { success: true, message: 'No action taken' };
                break;
        }

        // Update to executed
        await pool.query(
            `UPDATE aria_actions
             SET status = 'executed',
                 executed_at = NOW(),
                 outcome = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [outcome, actionId]
        );

        // After execution, update person state and resolve observation if applicable
        if (act.person_id) {
            await updatePersonState(act.person_id, act.organization_id);
        }

        // If there's an observation, resolve it (but only if the action was successful)
        if (act.observation_id && outcome.success) {
            await pool.query(
                `UPDATE aria_observations
                 SET status = 'resolved',
                     resolved_at = NOW(),
                     updated_at = NOW()
                 WHERE id = $1`,
                [act.observation_id]
            );
        }

        return await pool.query(`SELECT * FROM aria_actions WHERE id = $1`, [actionId]).then(r => r.rows[0]);

    } catch (err) {
        // Update to failed
        await pool.query(
            `UPDATE aria_actions
             SET status = 'failed',
                 failure_reason = $1,
                 updated_at = NOW()
             WHERE id = $2`,
            [err.message, actionId]
        );
        throw err;
    }
}

/**
 * Get pending actions for an organization (proposed or approved).
 */
export async function getPendingActions(orgId, limit = 20) {
    const result = await pool.query(
        `SELECT a.*, p.first_name, p.phone,
                o.type as observation_type, o.severity, o.urgency, o.attention_score,
                o.evidence
         FROM aria_actions a
         LEFT JOIN people p ON a.person_id = p.id
         LEFT JOIN aria_observations o ON a.observation_id = o.id
         WHERE a.organization_id = $1
           AND a.status IN ('proposed', 'approved')
         ORDER BY a.priority DESC, a.proposed_at ASC
         LIMIT $2`,
        [orgId, limit]
    );
    return result.rows;
}

/**
 * Get action history for a person.
 */
export async function getActionsForPerson(personId, orgId, limit = 20) {
    const result = await pool.query(
        `SELECT * FROM aria_actions
         WHERE person_id = $1 AND organization_id = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [personId, orgId, limit]
    );
    return result.rows;
}

/**
 * Generate actions from high-priority observations.
 * This is the bridge between observations and actions.
 */
export async function generateActionsFromObservations(orgId) {
    // Fetch active observations with high attention score
    const obsRes = await pool.query(
        `SELECT id, person_id, type, attention_score, severity, urgency, evidence
         FROM aria_observations
         WHERE organization_id = $1
           AND status = 'active'
           AND attention_score > 50
         ORDER BY attention_score DESC`,
        [orgId]
    );

    const actionsCreated = [];
    for (const obs of obsRes.rows) {
        // Determine action type based on observation type
        let actionType = 'DO_NOTHING';
        let priority = 'medium';
        let metadata = {};

        switch (obs.type) {
            case 'NEW_PERSON':
                actionType = 'SEND_MESSAGE';
                priority = 'medium';
                metadata = { template: 'welcome' };
                break;

            case 'ATTENDANCE_CHANGE':
                actionType = 'SEND_MESSAGE';
                priority = obs.severity === 'high' ? 'high' : 'medium';
                metadata = { template: 'check_in' };
                break;

            case 'UNUSUAL_ABSENCE':
                actionType = 'SEND_MESSAGE';
                priority = obs.severity === 'critical' ? 'critical' : 'high';
                metadata = { template: 'concern' };
                break;

            case 'CARE_RISK':
                actionType = 'ESCALATE';
                priority = obs.severity === 'critical' ? 'critical' : 'high';
                metadata = { reason: 'Care risk detected' };
                break;

            case 'POSSIBLE_DUPLICATE':
                actionType = 'REQUEST_REVIEW';
                priority = 'medium';
                metadata = { type: 'duplicate_review' };
                break;

            case 'LOW_ENGAGEMENT':
                actionType = 'SEND_MESSAGE';
                priority = 'medium';
                metadata = { template: 'reengage' };
                break;

            default:
                continue; // skip unknown types
        }

        // Create action
        const actionId = await planActionFromObservation({
            organizationId: orgId,
            personId: obs.person_id,
            observationId: obs.id,
            actionType,
            priority,
            actionMetadata: metadata,
            actionKey: `${orgId}:${obs.person_id || 'global'}:${actionType}:${obs.id}`,
        });

        if (actionId) {
            actionsCreated.push({ actionId, observationId: obs.id });
        }
    }

    return actionsCreated;
                }
