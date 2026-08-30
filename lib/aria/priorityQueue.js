// lib/aria/priorityQueue.js
import pool from '../db';

/*
 * REAL-DATA PRIORITY ENGINE
 * Uses only tables that exist:
 * people, attendance_records, participation_records,
 * relationship_scores, aria_observations, aria_person_state.
 *
 * ARIA does NOT claim to predict the future.
 * It detects emerging patterns that may indicate someone is slipping.
 */

export async function getPriorityQueue(orgId,limit=10){
  if(!orgId)throw new Error('orgId required');
  const safeLimit=Math.min(Math.max(Number(limit)||10,1),100);

  const result=await pool.query(`
    WITH attendance AS(
      SELECT
        ar.people_id AS person_id,
        COUNT(*) FILTER(
          WHERE ar.present=true
        )::int AS total_attendance,
        COUNT(*) FILTER(
          WHERE ar.present=true
          AND ar.attendance_date>=CURRENT_DATE-INTERVAL '30 days'
        )::int AS recent_attendance,
        COUNT(*) FILTER(
          WHERE ar.present=true
          AND ar.attendance_date>=CURRENT_DATE-INTERVAL '60 days'
          AND ar.attendance_date<CURRENT_DATE-INTERVAL '30 days'
        )::int AS previous_attendance,
        MAX(ar.attendance_date) FILTER(
          WHERE ar.present=true
        ) AS last_attendance
      FROM attendance_records ar
      WHERE ar.organization_id=$1
      GROUP BY ar.people_id
    ),
    observations AS(
      SELECT
        person_id,
        COUNT(*) FILTER(
          WHERE status='active'
          AND(expired_at IS NULL OR expired_at>NOW())
        )::int AS observation_count,
        COALESCE(MAX(attention_score),0)::numeric AS max_attention
      FROM aria_observations
      WHERE organization_id=$1
      GROUP BY person_id
    ),
    actions AS(
      SELECT
        person_id,
        COUNT(*) FILTER(
          WHERE status IN('proposed','approved','queued')
        )::int AS action_count
      FROM aria_actions
      WHERE organization_id=$1
      GROUP BY person_id
    ),
    state AS(
      SELECT
        person_id,
        engagement_state,
        care_state,
        attention_level,
        open_observation_count,
        open_action_count
      FROM aria_person_state
      WHERE organization_id=$1
    ),
    relationship AS(
      SELECT
        person_id,
        score
      FROM relationship_scores
      WHERE organization_id=$1
    ),
    combined AS(
      SELECT
        p.id AS person_id,
        p.first_name,
        p.last_name,
        p.phone,
        a.total_attendance,
        a.recent_attendance,
        a.previous_attendance,
        a.last_attendance,
        COALESCE(o.observation_count,0) AS observation_count,
        COALESCE(o.max_attention,0) AS max_attention,
        COALESCE(ac.action_count,0) AS action_count,
        s.engagement_state,
        s.care_state,
        COALESCE(s.attention_level,'none') AS attention_level,
        COALESCE(r.score,50) AS relationship_score,

        CASE
          WHEN a.previous_attendance>0
            AND a.recent_attendance<a.previous_attendance
          THEN GREATEST(
            10,
            LEAST(
              40,
              ((a.previous_attendance-a.recent_attendance)*15)
            )
          )
          ELSE 0
        END AS decline_score,

        CASE
          WHEN a.last_attendance IS NOT NULL
            AND a.last_attendance<CURRENT_DATE-INTERVAL '21 days'
          THEN 35
          WHEN a.last_attendance IS NOT NULL
            AND a.last_attendance<CURRENT_DATE-INTERVAL '14 days'
          THEN 25
          WHEN a.last_attendance IS NOT NULL
            AND a.last_attendance<CURRENT_DATE-INTERVAL '7 days'
          THEN 15
          ELSE 0
        END AS absence_score,

        CASE
          WHEN COALESCE(o.max_attention,0)>=75 THEN 30
          WHEN COALESCE(o.max_attention,0)>=50 THEN 20
          WHEN COALESCE(o.max_attention,0)>=25 THEN 10
          ELSE 0
        END AS observation_score
      FROM people p
      LEFT JOIN attendance a ON a.person_id=p.id
      LEFT JOIN observations o ON o.person_id=p.id
      LEFT JOIN actions ac ON ac.person_id=p.id
      LEFT JOIN state s ON s.person_id=p.id
      LEFT JOIN relationship r ON r.person_id=p.id
      WHERE p.organization_id=$1
        AND p.status='active'
    )
    SELECT *,
      (
        decline_score+
        absence_score+
        observation_score+
        CASE
          WHEN attention_level='critical' THEN 20
          WHEN attention_level='high' THEN 12
          WHEN attention_level='medium' THEN 6
          ELSE 0
        END+
        CASE
          WHEN relationship_score<30 THEN 10
          WHEN relationship_score<50 THEN 5
          ELSE 0
        END
      )::int AS priority_score,

      CASE
        WHEN decline_score>=25
          THEN 'emerging_attendance_decline'
        WHEN absence_score>=35
          THEN 'extended_absence'
        WHEN observation_score>=20
          THEN 'active_aria_signal'
        WHEN relationship_score<30
          THEN 'weak_relationship_signal'
        ELSE 'attention_needed'
      END AS signal_type,

      CASE
        WHEN decline_score>=25
          THEN 'Pattern suggests attendance is declining.'
        WHEN absence_score>=35
          THEN 'Pattern suggests this person may be slipping from regular participation.'
        WHEN observation_score>=20
          THEN 'ARIA has an active observation requiring attention.'
        WHEN relationship_score<30
          THEN 'Relationship score is showing a weak connection signal.'
        ELSE 'Recent signals suggest this person deserves attention.'
      END AS reason

    FROM combined
    WHERE(
      decline_score+
      absence_score+
      observation_score+
      CASE
        WHEN attention_level='critical' THEN 20
        WHEN attention_level='high' THEN 12
        WHEN attention_level='medium' THEN 6
        ELSE 0
      END+
      CASE
        WHEN relationship_score<30 THEN 10
        WHEN relationship_score<50 THEN 5
        ELSE 0
      END
    )>0
    ORDER BY priority_score DESC,last_attendance ASC NULLS FIRST
    LIMIT $2
  `,[orgId,safeLimit]);

  return result.rows;
                                }
