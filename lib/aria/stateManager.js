// lib/aria/stateManager.js
import pool from '../db';

/**
 * Update aria_person_state based on current engagement metrics and open observations/actions.
 */
export async function updatePersonState(personId, orgId) {
  // Fetch engagement metrics and cases
  const metricsRes = await pool.query(
    `SELECT engagement_status, inactivity_streak, risk_level
     FROM engagement_metrics
     WHERE person_id = $1 AND organization_id = $2`,
    [personId, orgId]
  );
  const metrics = metricsRes.rows[0] || null;

  const casesRes = await pool.query(
    `SELECT engagement_status, risk_level
     FROM engagement_cases
     WHERE person_id = $1 AND organization_id = $2 AND resolved = false`,
    [personId, orgId]
  );
  const caseRow = casesRes.rows[0] || null;

  // Compute states
  let engagementState = 'unknown';
  let careState = 'none';
  let relationshipState = 'unknown';
  let followupState = 'none';
  let attentionLevel = 'none';

  if (metrics) {
    engagementState = metrics.engagement_status || 'unknown';
    const risk = metrics.risk_level || 'low';
    if (risk === 'critical') attentionLevel = 'critical';
    else if (risk === 'high') attentionLevel = 'high';
    else if (risk === 'medium') attentionLevel = 'medium';
    else attentionLevel = 'low';
  }

  if (caseRow) {
    careState = caseRow.engagement_status || 'none';
    // Override attention level if case is urgent
    if (caseRow.engagement_status === 'urgent_action_required') attentionLevel = 'critical';
  }

  // Count open observations and actions
  const obsCount = await pool.query(
    `SELECT COUNT(*) FROM aria_observations WHERE person_id = $1 AND status = 'active'`,
    [personId]
  );
  const actionCount = await pool.query(
    `SELECT COUNT(*) FROM aria_actions WHERE person_id = $1 AND status IN ('proposed', 'approved', 'queued')`,
    [personId]
  );

  // Determine relationship state from first_seen and last_seen (could be derived from metrics)
  // For simplicity, we use engagement_status mapping
  if (metrics) {
    const status = metrics.engagement_status;
    if (status === 'first_time') relationshipState = 'new';
    else if (status === 'returning') relationshipState = 'returning';
    else if (status === 'regular' || status === 'active') relationshipState = 'regular';
    else if (status === 'inactive' || status === 'at_risk') relationshipState = 'dormant';
  }

  // Upsert person state
  await pool.query(
    `INSERT INTO aria_person_state (
      person_id, organization_id, engagement_state, care_state, relationship_state,
      followup_state, attention_level, open_observation_count, open_action_count,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    ON CONFLICT (person_id) DO UPDATE SET
      engagement_state = EXCLUDED.engagement_state,
      care_state = EXCLUDED.care_state,
      relationship_state = EXCLUDED.relationship_state,
      followup_state = EXCLUDED.followup_state,
      attention_level = EXCLUDED.attention_level,
      open_observation_count = EXCLUDED.open_observation_count,
      open_action_count = EXCLUDED.open_action_count,
      updated_at = NOW()`,
    [personId, orgId, engagementState, careState, relationshipState, followupState, attentionLevel, parseInt(obsCount.rows[0].count || 0), parseInt(actionCount.rows[0].count || 0)]
  );
}
