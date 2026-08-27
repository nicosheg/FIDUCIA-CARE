// lib/aria/recommendationEngine.js

import pool from '../db';

/**
 * ARIA Action Planning
 *
 * This module intentionally works only with:
 *
 * aria_observations
 *       ↓
 * aria_actions
 *
 * Legacy recommendations/care_actions are no longer
 * part of the ARIA action pipeline.
 */

// ------------------------------------------------------------
// Priority normalization
// ------------------------------------------------------------

const PRIORITY_ORDER = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function normalizePriority(
  priority
) {
  if (
    Object.prototype.hasOwnProperty.call(
      PRIORITY_ORDER,
      priority
    )
  ) {
    return priority;
  }

  return 'medium';
}

// ------------------------------------------------------------
// Plan action from observation
// ------------------------------------------------------------

export async function planActionFromObservation({
  organizationId,
  personId = null,
  observationId,
  actionType,
  priority = 'medium',
  actionMetadata = {},
  actionKey = null,
}) {
  if (!organizationId) {
    throw new Error(
      'organizationId required'
    );
  }

  if (!observationId) {
    throw new Error(
      'observationId required'
    );
  }

  if (!actionType) {
    throw new Error(
      'actionType required'
    );
  }

  const normalizedPriority =
    normalizePriority(priority);

  const key =
    actionKey ||
    [
      organizationId,
      personId || 'global',
      actionType,
      observationId,
    ].join(':');

  const result = await pool.query(
    `
      INSERT INTO aria_actions (
        organization_id,
        person_id,
        observation_id,
        type,
        status,
        priority,
        action_metadata,
        action_key,
        proposed_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'proposed',
        $5,
        $6,
        $7,
        NOW()
      )

      ON CONFLICT (action_key)
      DO NOTHING

      RETURNING id
    `,
    [
      organizationId,
      personId,
      observationId,
      actionType,
      normalizedPriority,
      actionMetadata,
      key,
    ]
  );

  return result.rows[0]?.id || null;
}

// ------------------------------------------------------------
// Approve
// ------------------------------------------------------------

export async function approveAction(
  actionId,
  approvedByUserId
) {
  if (!actionId) {
    throw new Error('actionId required');
  }

  if (!approvedByUserId) {
    throw new Error(
      'approvedByUserId required'
    );
  }

  const result = await pool.query(
    `
      UPDATE aria_actions

      SET
        status = 'approved',
        approved_by = $1,
        approved_at = NOW(),
        updated_at = NOW()

      WHERE id = $2
        AND status = 'proposed'

      RETURNING *
    `,
    [
      approvedByUserId,
      actionId,
    ]
  );

  return result.rows[0] || null;
}

// ------------------------------------------------------------
// Reject
// ------------------------------------------------------------

export async function rejectAction(
  actionId,
  reason = null
) {
  if (!actionId) {
    throw new Error('actionId required');
  }

  const result = await pool.query(
    `
      UPDATE aria_actions

      SET
        status = 'cancelled',
        failure_reason = $1,
        updated_at = NOW()

      WHERE id = $2
        AND status IN (
          'proposed',
          'approved'
        )

      RETURNING *
    `,
    [
      reason,
      actionId,
    ]
  );

  return result.rows[0] || null;
}

// ------------------------------------------------------------
// Execute
// ------------------------------------------------------------

export async function executeAction(
  actionId,
  executor
) {
  if (!actionId) {
    throw new Error('actionId required');
  }

  const result = await pool.query(
    `
      SELECT *
      FROM aria_actions
      WHERE id = $1
        AND status = 'approved'
    `,
    [actionId]
  );

  if (result.rows.length === 0) {
    throw new Error(
      'Action not found or not approved'
    );
  }

  const action = result.rows[0];

  await pool.query(
    `
      UPDATE aria_actions
      SET
        status = 'executing',
        updated_at = NOW()
      WHERE id = $1
        AND status = 'approved'
    `,
    [actionId]
  );

  try {
    let outcome;

    switch (action.type) {
      case 'SEND_MESSAGE':
        /*
         * Messaging integration intentionally remains
         * outside this phase.
         *
         * ARIA may propose the action, but no fake
         * "message sent" result should be written.
         */
        outcome = {
          success: false,
          deferred: true,
          message:
            'Messaging execution is not integrated yet.',
        };
        break;

      case 'REQUEST_REVIEW':
        outcome = {
          success: true,
          message:
            'Review request created.',
        };
        break;

      case 'ESCALATE':
        outcome = {
          success: true,
          message:
            'Escalation recorded.',
        };
        break;

      case 'MARK_ATTENDANCE':
        outcome = {
          success: false,
          deferred: true,
          message:
            'Attendance execution is not integrated into this action executor yet.',
        };
        break;

      case 'SCAN':
        outcome = {
          success: false,
          deferred: true,
          message:
            'Scan execution is controlled by the scan pipeline.',
        };
        break;

      case 'DO_NOTHING':
        outcome = {
          success: true,
          message: 'No action taken.',
        };
        break;

      default:
        throw new Error(
          `Unsupported ARIA action type: ${action.type}`
        );
    }

    /*
     * Deferred execution is not success.
     */
    if (outcome.deferred) {
      await pool.query(
        `
          UPDATE aria_actions
          SET
            status = 'approved',
            outcome = $1,
            updated_at = NOW()
          WHERE id = $2
        `,
        [
          outcome,
          actionId,
        ]
      );

      return await getAction(
        actionId
      );
    }

    await pool.query(
      `
        UPDATE aria_actions
        SET
          status = 'executed',
          executed_at = NOW(),
          outcome = $1,
          updated_at = NOW()
        WHERE id = $2
      `,
      [
        outcome,
        actionId,
      ]
    );

    /*
     * Import lazily to avoid unnecessary module coupling.
     */
    if (action.person_id) {
      const {
        updatePersonState,
      } = await import(
        './stateManager'
      );

      await updatePersonState(
        action.person_id,
        action.organization_id
      );
    }

    if (
      action.observation_id &&
      outcome.success
    ) {
      await pool.query(
        `
          UPDATE aria_observations
          SET
            status = 'resolved',
            resolved_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
            AND status = 'active'
        `,
        [action.observation_id]
      );
    }

    return await getAction(
      actionId
    );
  } catch (err) {
    await pool.query(
      `
        UPDATE aria_actions

        SET
          status = 'failed',
          failure_reason = $1,
          updated_at = NOW()

        WHERE id = $2
      `,
      [
        err.message,
        actionId,
      ]
    );

    throw err;
  }
}

// ------------------------------------------------------------
// Get one action
// ------------------------------------------------------------

async function getAction(
  actionId
) {
  const result = await pool.query(
    `
      SELECT *
      FROM aria_actions
      WHERE id = $1
    `,
    [actionId]
  );

  return result.rows[0] || null;
}

// ------------------------------------------------------------
// Pending ARIA actions
// ------------------------------------------------------------

export async function getPendingActions(
  orgId,
  limit = 20
) {
  if (!orgId) {
    throw new Error('orgId required');
  }

  const safeLimit = Math.min(
    Math.max(
      Number(limit) || 20,
      1
    ),
    100
  );

  const result = await pool.query(
    `
      SELECT
        a.*,

        p.first_name,
        p.last_name,
        p.phone,

        o.type AS observation_type,
        o.severity,
        o.urgency,
        o.attention_score,
        o.evidence

      FROM aria_actions a

      LEFT JOIN people p
        ON p.id = a.person_id
       AND p.organization_id = a.organization_id

      LEFT JOIN aria_observations o
        ON o.id = a.observation_id
       AND o.organization_id = a.organization_id

      WHERE a.organization_id = $1
        AND a.status IN (
          'proposed',
          'approved'
        )

      ORDER BY
        CASE a.priority
          WHEN 'critical' THEN 4
          WHEN 'high' THEN 3
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 1
          ELSE 0
        END DESC,
        a.proposed_at ASC

      LIMIT $2
    `,
    [
      orgId,
      safeLimit,
    ]
  );

  return result.rows;
}

// ------------------------------------------------------------
// Person action history
// ------------------------------------------------------------

export async function getActionsForPerson(
  personId,
  orgId,
  limit = 20
) {
  if (!personId) {
    throw new Error('personId required');
  }

  if (!orgId) {
    throw new Error('orgId required');
  }

  const safeLimit = Math.min(
    Math.max(
      Number(limit) || 20,
      1
    ),
    100
  );

  const result = await pool.query(
    `
      SELECT *
      FROM aria_actions

      WHERE person_id = $1
        AND organization_id = $2

      ORDER BY created_at DESC

      LIMIT $3
    `,
    [
      personId,
      orgId,
      safeLimit,
    ]
  );

  return result.rows;
}

// ------------------------------------------------------------
// Generate actions from active observations
// ------------------------------------------------------------

export async function generateActionsFromObservations(
  orgId
) {
  if (!orgId) {
    throw new Error('orgId required');
  }

  const observations = await pool.query(
    `
      SELECT
        id,
        person_id,
        type,
        attention_score,
        severity,
        urgency,
        evidence

      FROM aria_observations

      WHERE organization_id = $1
        AND status = 'active'
        AND attention_score > 50

      ORDER BY
        attention_score DESC,
        detected_at ASC
    `,
    [orgId]
  );

  const actionsCreated = [];

  for (const observation of observations.rows) {
    let actionType;
    let priority;
    let metadata;

    switch (observation.type) {
      case 'NEW_PERSON':
        actionType = 'SEND_MESSAGE';
        priority = 'medium';
        metadata = {
          template: 'welcome',
        };
        break;

      case 'ATTENDANCE_CHANGE':
        actionType = 'SEND_MESSAGE';
        priority =
          observation.severity === 'high' ||
          observation.severity === 'critical'
            ? 'high'
            : 'medium';

        metadata = {
          template: 'check_in',
        };
        break;

      case 'UNUSUAL_ABSENCE':
        actionType = 'SEND_MESSAGE';
        priority =
          observation.severity === 'critical'
            ? 'critical'
            : 'high';

        metadata = {
          template: 'concern',
        };
        break;

      case 'CARE_RISK':
        actionType = 'ESCALATE';
        priority =
          observation.severity === 'critical'
            ? 'critical'
            : 'high';

        metadata = {
          reason:
            'Care risk detected',
        };
        break;

      case 'POSSIBLE_DUPLICATE':
        actionType = 'REQUEST_REVIEW';
        priority = 'medium';

        metadata = {
          type:
            'duplicate_review',
        };
        break;

      case 'LOW_ENGAGEMENT':
        actionType = 'SEND_MESSAGE';
        priority = 'medium';

        metadata = {
          template:
            'reengage',
        };
        break;

      default:
        continue;
    }

    const actionId =
      await planActionFromObservation({
        organizationId: orgId,
        personId:
          observation.person_id,
        observationId:
          observation.id,
        actionType,
        priority,
        actionMetadata:
          metadata,
        actionKey:
          `${orgId}:${observation.person_id || 'global'}:${actionType}:${observation.id}`,
      });

    if (actionId) {
      actionsCreated.push({
        actionId,
        observationId:
          observation.id,
      });
    }
  }

  return actionsCreated;
}
