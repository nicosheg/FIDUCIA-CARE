// lib/aria/stateManager.js
import pool from '../db';

export async function updatePersonState(
  personId,
  orgId,
  client = null
) {
  const db = client || pool;

  if (!personId) {
    throw new Error('personId is required');
  }

  if (!orgId) {
    throw new Error('orgId is required');
  }

  // ---------------------------------------------------------
  // 1. Engagement metrics
  // ---------------------------------------------------------

  const metricsRes = await db.query(
    `
      SELECT
        engagement_status,
        inactivity_streak,
        risk_level
      FROM engagement_metrics
      WHERE person_id = $1
        AND organization_id = $2
      LIMIT 1
    `,
    [personId, orgId]
  );

  const metrics = metricsRes.rows[0] || null;

  // ---------------------------------------------------------
  // 2. Determine the most important unresolved care case
  // ---------------------------------------------------------

  const casesRes = await db.query(
    `
      SELECT
        engagement_status,
        risk_level,
        updated_at
      FROM engagement_cases
      WHERE person_id = $1
        AND organization_id = $2
        AND resolved = false
      ORDER BY
        CASE risk_level
          WHEN 'critical' THEN 4
          WHEN 'high' THEN 3
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 1
          ELSE 0
        END DESC,

        CASE engagement_status
          WHEN 'urgent_action_required' THEN 4
          WHEN 'at_risk' THEN 3
          WHEN 'needs_attention' THEN 2
          WHEN 'active' THEN 1
          ELSE 0
        END DESC,

        updated_at DESC
      LIMIT 1
    `,
    [personId, orgId]
  );

  const caseRow = casesRes.rows[0] || null;

  // ---------------------------------------------------------
  // 3. Initial state
  // ---------------------------------------------------------

  let engagementState = 'unknown';
  let careState = 'none';
  let relationshipState = 'unknown';

  /*
   * Priority ordering:
   *
   * none       = 0
   * low        = 1
   * medium     = 2
   * high       = 3
   * critical   = 4
   */
  let attentionPriority = 0;

  const priorityToLevel = (priority) => {
    switch (priority) {
      case 4:
        return 'critical';
      case 3:
        return 'high';
      case 2:
        return 'medium';
      case 1:
        return 'low';
      default:
        return 'none';
    }
  };

  const riskToPriority = (risk) => {
    switch (risk) {
      case 'critical':
        return 4;
      case 'high':
        return 3;
      case 'medium':
        return 2;
      case 'low':
        return 1;
      default:
        return 0;
    }
  };

  const statusToPriority = (status) => {
    switch (status) {
      case 'urgent_action_required':
        return 4;
      case 'at_risk':
        return 3;
      case 'needs_attention':
        return 2;
      case 'active':
        return 1;
      default:
        return 0;
    }
  };

  // ---------------------------------------------------------
  // 4. Project engagement metrics
  // ---------------------------------------------------------

  if (metrics) {
    engagementState =
      metrics.engagement_status || 'unknown';

    attentionPriority = Math.max(
      attentionPriority,
      riskToPriority(metrics.risk_level)
    );
  }

  // ---------------------------------------------------------
  // 5. Project selected care case
  // ---------------------------------------------------------

  if (caseRow) {
    careState =
      caseRow.engagement_status || 'none';

    /*
     * risk_level is the primary care-priority authority.
     * engagement_status provides a secondary semantic signal.
     *
     * Taking the maximum prevents a lower-priority metrics row from
     * overriding a more urgent unresolved care case.
     */
    attentionPriority = Math.max(
      attentionPriority,
      riskToPriority(caseRow.risk_level),
      statusToPriority(caseRow.engagement_status)
    );
  }

  // ---------------------------------------------------------
  // 6. Organization-scoped active observation count
  // ---------------------------------------------------------

  const obsCount = await db.query(
    `
      SELECT COUNT(*)::int AS count
      FROM aria_observations
      WHERE person_id = $1
        AND organization_id = $2
        AND status = 'active'
    `,
    [personId, orgId]
  );

  // ---------------------------------------------------------
  // 7. Organization-scoped open action count
  // ---------------------------------------------------------

  const actionCount = await db.query(
    `
      SELECT COUNT(*)::int AS count
      FROM aria_actions
      WHERE person_id = $1
        AND organization_id = $2
        AND status IN ('proposed', 'approved', 'queued')
    `,
    [personId, orgId]
  );

  // ---------------------------------------------------------
  // 8. Relationship state
  // ---------------------------------------------------------

  if (metrics) {
    const status = metrics.engagement_status;

    if (status === 'first_time') {
      relationshipState = 'new';
    } else if (status === 'returning') {
      relationshipState = 'returning';
    } else if (
      status === 'regular' ||
      status === 'active'
    ) {
      relationshipState = 'regular';
    } else if (
      status === 'inactive' ||
      status === 'at_risk'
    ) {
      relationshipState = 'dormant';
    }
  }

  // ---------------------------------------------------------
  // 9. Final attention level
  // ---------------------------------------------------------

  const attentionLevel =
    priorityToLevel(attentionPriority);

  // ---------------------------------------------------------
  // 10. Upsert person state
  // ---------------------------------------------------------

  /*
   * IMPORTANT:
   * followup_state is intentionally supplied only on INSERT.
   *
   * It is NOT included in DO UPDATE.
   *
   * Therefore a future follow-up implementation can change the
   * existing value without Phase 5.1 overwriting it back to 'none'.
   */
  await db.query(
    `
      INSERT INTO aria_person_state (
        person_id,
        organization_id,
        engagement_state,
        care_state,
        relationship_state,
        followup_state,
        attention_level,
        open_observation_count,
        open_action_count,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        NOW()
      )

      ON CONFLICT (person_id)
      DO UPDATE SET
        engagement_state = EXCLUDED.engagement_state,
        care_state = EXCLUDED.care_state,
        relationship_state = EXCLUDED.relationship_state,
        attention_level = EXCLUDED.attention_level,
        open_observation_count = EXCLUDED.open_observation_count,
        open_action_count = EXCLUDED.open_action_count,
        updated_at = NOW()
    `,
    [
      personId,
      orgId,
      engagementState,
      careState,
      relationshipState,
      'none',
      attentionLevel,
      Number(obsCount.rows[0]?.count || 0),
      Number(actionCount.rows[0]?.count || 0),
    ]
  );

  return {
    personId,
    organizationId: orgId,
    engagementState,
    careState,
    relationshipState,
    attentionLevel,
    openObservationCount:
      Number(obsCount.rows[0]?.count || 0),
    openActionCount:
      Number(actionCount.rows[0]?.count || 0),
  };
    }
