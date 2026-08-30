// lib/aria/priorityQueue.js
import pool from '../db';

export async function getPriorityQueue(orgId,limit=10){
  if(!orgId)throw new Error('orgId required');

  const safeLimit=Math.min(Math.max(Number(limit)||10,1),100);

  const result=await pool.query(`
    WITH signals AS(
      SELECT
        o.person_id,
        MAX(o.attention_score) AS observation_score,
        COUNT(*)::int AS observation_count
      FROM aria_observations o
      WHERE o.organization_id=$1
        AND o.status='active'
        AND (o.expires_at IS NULL OR o.expires_at>NOW())
        AND o.person_id IS NOT NULL
      GROUP BY o.person_id
    ),
    actions AS(
      SELECT
        a.person_id,
        COUNT(*)::int AS action_count,
        MAX(
          CASE a.priority
            WHEN 'critical' THEN 4
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            ELSE 1
          END
        ) AS action_priority
      FROM aria_actions a
      WHERE a.organization_id=$1
        AND a.status IN('proposed','approved')
        AND a.person_id IS NOT NULL
      GROUP BY a.person_id
    ),
    attendance AS(
      SELECT
        ar.people_id AS person_id,
        COUNT(DISTINCT ar.session_id) FILTER(
          WHERE ar.present=true
            AND ar.attendance_date>=CURRENT_DATE-INTERVAL '30 days'
        )::int AS attended_30d
      FROM attendance_records ar
      WHERE ar.organization_id=$1
      GROUP BY ar.people_id
    )
    SELECT
      p.id,
      p.first_name,
      p.last_name,
      p.phone,
      COALESCE(s.observation_score,0)::int AS observation_score,
      COALESCE(s.observation_count,0) AS observation_count,
      COALESCE(a.action_count,0) AS open_action_count,
      COALESCE(at.attended_30d,0) AS attended_30d,
      (
        COALESCE(s.observation_score,0)
        +COALESCE(a.action_priority,0)*10
        +CASE
          WHEN COALESCE(at.attended_30d,0)=0 THEN 10
          ELSE 0
        END
      )::int AS priority_score
    FROM people p
    LEFT JOIN signals s ON s.person_id=p.id
    LEFT JOIN actions a ON a.person_id=p.id
    LEFT JOIN attendance at ON at.person_id=p.id
    WHERE p.organization_id=$1
      AND p.status='active'
      AND(
        s.person_id IS NOT NULL
        OR a.person_id IS NOT NULL
      )
    ORDER BY priority_score DESC,p.first_name ASC
    LIMIT $2
  `,[orgId,safeLimit]);

  return result.rows;
}
