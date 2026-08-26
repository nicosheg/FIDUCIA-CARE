// lib/aria/stateManager.js
import pool from '../db';

const RISK_SCORE = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const ATTENTION_LEVEL = {
  4: 'critical',
  3: 'high',
  2: 'medium',
  1: 'low',
  0: 'none',
};

function riskScore(level) {
  return RISK_SCORE[level] || 0;
}

function attentionFromScore(score) {
  if (!Number.isFinite(Number(score))) return 'none';
  const rounded = Math.max(0, Math.min(4, Math.round(Number(score))));
  return ATTENTION_LEVEL[rounded] || 'none';
}

export async function updatePersonState(personId, orgId, client = null) {
  if (!personId) throw new Error('personId is required');
  if (!orgId) throw new Error('orgId is required');

  const db = client || pool;

  const metricsRes = await db.query(
    `SELECT engagement_status, inactivity_streak, risk_level
     FROM engagement_metrics
     WHERE person_id = $1 AND organization_id = $2
     LIMIT 1`,
    [personId, orgId]
  );

  const metrics = metricsRes.rows[0] || null;

  const casesRes = await db.query(
    `SELECT engagement_status, risk_level, updated_at
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
     LIMIT 1`,
    [personId, orgId]
  );

  const caseRow = casesRes.rows[0] || null;

  const observationsRes = await db.query(
    `SELECT
       COUNT(*)::int AS count,
       COALESCE(MAX(attention_score), 0)::int AS max_attention
     FROM aria_observations
     WHERE person_id = $1
       AND organization_id = $2
       AND status = 'active'
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [personId, orgId]
  );

  const observationStats = observationsRes.rows[0] || {
    count: 0,
    max_attention: 0,
  };

  const actionsRes = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM aria_actions
     WHERE person_id = $1
       AND organization_id = $2
       AND status IN ('proposed', 'approved', 'queued')`,
    [personId, orgId]
  );

  const actionCount = actionsRes.rows[0]?.count || 0;

  let engagementState = metrics?.engagement_status || 'unknown';
  let careState = 'none';
  let relationshipState = 'unknown';

  if (caseRow) {
    careState = caseRow.engagement_status || 'none';
  } else if (metrics?.risk_level) {
    const fallbackCare = {
      critical: 'urgent_action_required',
      high: 'at_risk',
      medium: 'needs_attention',
      low: 'active',
    };
    careState = fallbackCare[metrics.risk_level] || 'none';
  }

  if (metrics) {
    const status = metrics.engagement_status;

    if (status === 'first_time') {
      relationshipState = 'new';
    } else if (status === 'returning') {
      relationshipState = 'returning';
    } else if (status === 'regular' || status === 'active') {
      relationshipState = 'regular';
    } else if (status === 'inactive' || status === 'at_risk') {
      relationshipState = 'dormant';
    }
  }

  const metricRisk = riskScore(metrics?.risk_level);
  const caseRisk = riskScore(caseRow?.risk_level);

  let observationRisk = 0;
  const maxObservationAttention = Number(observationStats.max_attention) || 0;

  if (maxObservationAttention >= 75) {
    observationRisk = 4;
  } else if (maxObservationAttention >= 50) {
    observationRisk = 3;
  } else if (maxObservationAttention >= 25) {
    observationRisk = 2;
  } else if (maxObservationAttention > 0) {
    observationRisk = 1;
  }

  const highestRisk = Math.max(metricRisk, caseRisk, observationRisk);
  const attentionLevel = attentionFromScore(highestRisk);

  await db.query(
    `INSERT INTO aria_person_state (
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
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (person_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      engagement_state = EXCLUDED.engagement_state,
      care_state = EXCLUDED.care_state,
      relationship_state = EXCLUDED.relationship_state,
      attention_level = EXCLUDED.attention_level,
      open_observation_count = EXCLUDED.open_observation_count,
      open_action_count = EXCLUDED.open_action_count,
      updated_at = NOW()`,
    [
      personId,
      orgId,
      engagementState,
      careState,
      relationshipState,
      'none',
      attentionLevel,
      Number(observationStats.count) || 0,
      actionCount,
    ]
  );

  return {
    personId,
    organizationId: orgId,
    engagementState,
    careState,
    relationshipState,
    attentionLevel,
    openObservationCount: Number(observationStats.count) || 0,
    openActionCount: actionCount,
  };
    }
