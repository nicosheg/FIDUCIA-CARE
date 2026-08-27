// pages/api/care-queue.js

import pool from '../../lib/db';
import { withOrg } from '../../lib/apiHelpers';

async function handler(req, res) {
  const orgId = req.org.id;

  if (req.method === 'POST') {
    /*
     * This endpoint does not perform fake/background work.
     *
     * The actual intelligence pipeline is responsible for
     * producing observations/actions.
     */
    return res.status(200).json({
      success: true,
      message: 'ARIA intelligence refresh requested.',
    });
  }

  if (req.method !== 'GET') {
    res.setHeader(
      'Allow',
      ['GET', 'POST']
    );

    return res
      .status(405)
      .end(
        `Method ${req.method} Not Allowed`
      );
  }

  try {
    const result = await pool.query(
      `
        SELECT
          p.id AS person_id,
          p.first_name,
          p.last_name,
          p.phone,

          aps.engagement_state,
          aps.care_state,
          aps.relationship_state,
          aps.followup_state,
          aps.attention_level,
          aps.open_observation_count,
          aps.open_action_count,
          aps.updated_at AS state_updated_at,

          ec.risk_level,
          ec.engagement_status,
          ec.inactivity_streak,
          ec.last_seen,
          ec.created_at AS case_created_at

        FROM people p

        LEFT JOIN aria_person_state aps
          ON aps.person_id = p.id
         AND aps.organization_id = p.organization_id

        LEFT JOIN LATERAL (
          SELECT
            engagement_cases.risk_level,
            engagement_cases.engagement_status,
            engagement_cases.inactivity_streak,
            engagement_cases.last_seen,
            engagement_cases.created_at

          FROM engagement_cases

          WHERE engagement_cases.person_id = p.id
            AND engagement_cases.organization_id = $1
            AND engagement_cases.resolved = false

          ORDER BY
            CASE engagement_cases.risk_level
              WHEN 'critical' THEN 4
              WHEN 'high' THEN 3
              WHEN 'medium' THEN 2
              WHEN 'low' THEN 1
              ELSE 0
            END DESC,
            engagement_cases.updated_at DESC

          LIMIT 1
        ) ec ON true

        WHERE p.organization_id = $1
          AND p.status = 'active'

          AND (
            COALESCE(
              aps.open_observation_count,
              0
            ) > 0

            OR COALESCE(
              aps.open_action_count,
              0
            ) > 0

            OR ec.risk_level IS NOT NULL
          )

        ORDER BY
          CASE
            WHEN aps.attention_level =
              'critical'
              THEN 1

            WHEN aps.attention_level =
              'high'
              THEN 2

            WHEN ec.risk_level =
              'critical'
              THEN 3

            WHEN ec.risk_level =
              'high'
              THEN 4

            WHEN aps.attention_level =
              'medium'
              THEN 5

            ELSE 6
          END,

          COALESCE(
            ec.inactivity_streak,
            0
          ) DESC

        LIMIT 30
      `,
      [orgId]
    );

    const items =
      result.rows.map(row => ({
        person_id: row.person_id,

        first_name:
          row.first_name,

        last_name:
          row.last_name,

        phone:
          row.phone,

        priority:
          row.attention_level ||
          (
            row.risk_level === 'critical'
              ? 'critical'
              : row.risk_level === 'high'
                ? 'high'
                : row.risk_level === 'medium'
                  ? 'medium'
                  : 'low'
          ),

        risk_level:
          row.risk_level,

        attention_level:
          row.attention_level,

        engagement_state:
          row.engagement_state,

        care_state:
          row.care_state,

        relationship_state:
          row.relationship_state,

        followup_state:
          row.followup_state,

        engagement_status:
          row.engagement_status,

        inactivity_streak:
          row.inactivity_streak,

        open_observation_count:
          row.open_observation_count || 0,

        open_action_count:
          row.open_action_count || 0,

        last_seen:
          row.last_seen,

        state_updated_at:
          row.state_updated_at,
      }));

    return res.status(200).json(items);
  } catch (err) {
    console.error(
      '[ARIA] Care Queue error:',
      err
    );

    return res.status(500).json({
      error: err.message,
    });
  }
}

export default withOrg(handler);
