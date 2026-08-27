// lib/aria/priorityQueue.js

import pool from '../db';

/**
 * Get the people who currently deserve ARIA's attention.
 *
 * This is a READ MODEL.
 *
 * It does not:
 * - create actions
 * - send messages
 * - modify people
 * - resolve cases
 *
 * It simply ranks current signals.
 */
export async function getPriorityQueue(
  orgId,
  limit = 10
) {
  if (!orgId) {
    throw new Error('orgId required');
  }

  const safeLimit = Math.min(
    Math.max(Number(limit) || 10, 1),
    100
  );

  const result = await pool.query(
    `
      WITH combined AS (

        SELECT
          p.id,
          p.first_name,
          p.last_name,
          p.phone,

          COALESCE(
            ec.risk_level,
            'low'
          ) AS risk_level,

          COALESCE(
            ec.engagement_status,
            'active'
          ) AS engagement_status,

          COALESCE(
            cp.churn_likelihood,
            0
          ) AS churn_likelihood,

          COALESCE(
            rs.score,
            50
          ) AS relationship_score,

          COALESCE(
            em.inactivity_streak,
            0
          ) AS inactivity_streak,

          p.living_truth->>'status'
            AS living_truth_status,

          COALESCE(
            aps.attention_level,
            'none'
          ) AS attention_level,

          COALESCE(
            aps.open_observation_count,
            0
          ) AS open_observation_count,

          COALESCE(
            aps.open_action_count,
            0
          ) AS open_action_count,

          (
            CASE
              WHEN ec.engagement_status =
                'urgent_action_required'
                THEN 100

              WHEN ec.engagement_status =
                'at_risk'
                THEN 80

              WHEN cp.churn_likelihood > 80
                THEN 70

              WHEN ec.engagement_status =
                'needs_attention'
                THEN 60

              WHEN cp.churn_likelihood > 50
                THEN 50

              WHEN p.living_truth->>'status'
                IN ('needs_decision', 'conflict')
                THEN 40

              WHEN em.inactivity_streak > 0
                THEN 30

              ELSE 0
            END

            +

            CASE
              WHEN rs.score IS NOT NULL
                THEN rs.score / 10
              ELSE 0
            END

            +

            CASE
              WHEN aps.attention_level =
                'critical'
                THEN 20

              WHEN aps.attention_level =
                'high'
                THEN 12

              WHEN aps.attention_level =
                'medium'
                THEN 6

              ELSE 0
            END
          ) AS priority_score

        FROM people p

        LEFT JOIN engagement_cases ec
          ON p.id = ec.person_id
         AND ec.organization_id = $1
         AND ec.resolved = false

        LEFT JOIN churn_predictions cp
          ON p.id = cp.person_id
         AND cp.organization_id = $1

        LEFT JOIN relationship_scores rs
          ON p.id = rs.person_id
         AND rs.organization_id = $1

        LEFT JOIN engagement_metrics em
          ON p.id = em.person_id
         AND em.organization_id = $1

        LEFT JOIN aria_person_state aps
          ON p.id = aps.person_id
         AND aps.organization_id = $1

        WHERE p.organization_id = $1
          AND p.status = 'active'

          AND (
            ec.risk_level IS NOT NULL

            OR cp.churn_likelihood > 0

            OR em.inactivity_streak > 0

            OR p.living_truth->>'status'
              IN (
                'needs_decision',
                'conflict'
              )

            OR aps.open_observation_count > 0

            OR aps.open_action_count > 0
          )
      )

      SELECT *
      FROM combined

      WHERE priority_score > 0

      ORDER BY
        priority_score DESC,
        inactivity_streak DESC

      LIMIT $2
    `,
    [
      orgId,
      safeLimit,
    ]
  );

  return result.rows;
}
