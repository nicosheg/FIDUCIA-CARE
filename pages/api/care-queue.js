// pages/api/care-queue.js
// ARIA What's Next — grounded entirely in real tables.

import pool from '../../lib/db';
import { withOrg } from '../../lib/apiHelpers';

const priorityRank = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function nextAction(type, action) {
  if (action) {
    const map = {
      SEND_MESSAGE: 'Reach out personally',
      REQUEST_REVIEW: 'Review this person',
      ESCALATE: 'Give this person closer attention',
      MARK_ATTENDANCE: 'Review attendance',
      SCAN: 'Review the latest scan',
      DO_NOTHING: 'Keep observing',
    };

    return map[action.type] || 'Review this signal';
  }

  const map = {
    NEW_PERSON: 'Welcome this person',
    UNUSUAL_ABSENCE: 'Check in with this person',
    LOW_ENGAGEMENT: 'Reach out personally',
    ATTENDANCE_CHANGE: 'Review their recent attendance',
    CARE_RISK: 'Give this person closer attention',
    POSSIBLE_DUPLICATE: 'Review this person',
    PATTERN: 'Review the emerging pattern',
  };

  return map[type] || 'Review this signal';
}

function signalText(obs) {
  const evidence = obs?.evidence || {};

  if (evidence.inference) {
    return evidence.inference;
  }

  const map = {
    NEW_PERSON: 'A new person was discovered.',
    UNUSUAL_ABSENCE: 'An unusual attendance pattern was detected.',
    LOW_ENGAGEMENT: 'Engagement appears to be changing.',
    ATTENDANCE_CHANGE: 'A change in attendance was detected.',
    CARE_RISK: 'ARIA detected a care-related signal.',
    POSSIBLE_DUPLICATE: 'This person may need a record review.',
    PATTERN: 'ARIA detected an emerging pattern.',
  };

  return map[obs?.type] || 'ARIA detected a meaningful signal.';
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // IMPORTANT:
  // withOrg() guarantees req.org exists before this handler runs.
  const orgId = req.org.id;

  try {
    const result = await pool.query(
      `
      WITH latest_obs AS (
        SELECT *
        FROM (
          SELECT
            o.*,
            ROW_NUMBER() OVER (
              PARTITION BY o.person_id
              ORDER BY o.attention_score DESC, o.detected_at DESC
            ) rn
          FROM aria_observations o
          WHERE o.organization_id = $1
            AND o.status = 'active'
            AND (
              o.expires_at IS NULL
              OR o.expires_at > NOW()
            )
        ) x
        WHERE rn = 1
      ),

      pending_action AS (
        SELECT *
        FROM (
          SELECT
            a.*,
            ROW_NUMBER() OVER (
              PARTITION BY a.person_id
              ORDER BY
                CASE a.priority
                  WHEN 'critical' THEN 4
                  WHEN 'high' THEN 3
                  WHEN 'medium' THEN 2
                  WHEN 'low' THEN 1
                  ELSE 0
                END DESC,
                a.proposed_at ASC
            ) rn
          FROM aria_actions a
          WHERE a.organization_id = $1
            AND a.status IN ('proposed', 'approved')
        ) x
        WHERE rn = 1
      )

      SELECT
        p.id AS person_id,
        p.first_name,
        p.last_name,
        p.phone,

        o.id AS observation_id,
        o.type AS observation_type,
        o.confidence,
        o.severity,
        o.urgency,
        o.attention_score,
        o.evidence,
        o.detected_at,

        a.id AS action_id,
        a.type AS action_type,
        a.status AS action_status,
        a.priority AS action_priority,
        a.action_metadata,

        aps.engagement_state,
        aps.care_state,
        aps.relationship_state,
        aps.followup_state,
        aps.attention_level,

        COALESCE(aps.open_observation_count, 0)
          AS open_observation_count,

        COALESCE(aps.open_action_count, 0)
          AS open_action_count,

        aps.updated_at AS state_updated_at,

        attendance.last_seen,
        attendance.sessions_30d,
        attendance.attended_30d

      FROM people p

      LEFT JOIN latest_obs o
        ON o.person_id = p.id

      LEFT JOIN pending_action a
        ON a.person_id = p.id

      LEFT JOIN aria_person_state aps
        ON aps.person_id = p.id
       AND aps.organization_id = p.organization_id

      LEFT JOIN LATERAL (
        SELECT
          MAX(ar.attendance_date) FILTER (
            WHERE ar.present = true
              AND ar.confirmed = true
          ) AS last_seen,

          COUNT(DISTINCT ar.session_id) FILTER (
            WHERE ar.attendance_date >= CURRENT_DATE - INTERVAL '30 days'
          ) AS sessions_30d,

          COUNT(DISTINCT ar.session_id) FILTER (
            WHERE ar.present = true
              AND ar.confirmed = true
              AND ar.attendance_date >= CURRENT_DATE - INTERVAL '30 days'
          ) AS attended_30d

        FROM attendance_records ar

        WHERE ar.people_id = p.id
          AND ar.organization_id = $1
      ) attendance ON true

      WHERE p.organization_id = $1
        AND p.status = 'active'
        AND (
          o.id IS NOT NULL
          OR a.id IS NOT NULL
          OR COALESCE(aps.open_observation_count, 0) > 0
          OR COALESCE(aps.open_action_count, 0) > 0
        )

      ORDER BY
        CASE COALESCE(
          a.priority,
          o.severity,
          aps.attention_level,
          'low'
        )
          WHEN 'critical' THEN 4
          WHEN 'high' THEN 3
          WHEN 'medium' THEN 2
          ELSE 1
        END DESC,

        COALESCE(o.attention_score, 0) DESC,

        COALESCE(a.proposed_at, o.detected_at) ASC

      LIMIT 30
      `,
      [orgId]
    );

    const items = result.rows.map((row) => {
      const priority =
        row.action_priority ||
        row.severity ||
        row.attention_level ||
        'low';

      return {
        id: row.observation_id || row.action_id || row.person_id,

        person_id: row.person_id,
        first_name: row.first_name,
        last_name: row.last_name,
        phone: row.phone,

        priority,
        risk_level: priority,

        text: row.observation_type
          ? signalText({
              type: row.observation_type,
              evidence: row.evidence,
            })
          : 'ARIA has a pending action for this person.',

        observation_type: row.observation_type,
        observation_id: row.observation_id,

        confidence: row.confidence,
        severity: row.severity,
        urgency: row.urgency,
        attention_score: row.attention_score,
        evidence: row.evidence || null,
        detected_at: row.detected_at,

        action_id: row.action_id,
        action_type: row.action_type,
        action_status: row.action_status,

        suggestion: nextAction(
          row.observation_type,
          row.action_type
            ? { type: row.action_type }
            : null
        ),

        engagement_state: row.engagement_state,
        care_state: row.care_state,
        relationship_state: row.relationship_state,
        followup_state: row.followup_state,
        attention_level: row.attention_level,

        open_observation_count:
          Number(row.open_observation_count) || 0,

        open_action_count:
          Number(row.open_action_count) || 0,

        last_seen: row.last_seen,
        sessions_30d: Number(row.sessions_30d) || 0,
        attended_30d: Number(row.attended_30d) || 0,

        state_updated_at: row.state_updated_at,
      };
    });

    return res.status(200).json(items);
  } catch (err) {
    console.error('[ARIA] Care Queue error:', err);

    return res.status(500).json({
      error: 'Unable to load ARIA care queue.',
    });
  }
}

export default withOrg(handler);
