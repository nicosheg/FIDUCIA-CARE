// lib/aria/priorityQueue.js
import pool from '../db';

export async function getPriorityQueue(orgId,limit=10){
 if(!orgId)throw new Error('orgId required');
 const safeLimit=Math.min(Math.max(Number(limit)||10,1),100);

 const result=await pool.query(`
  WITH base AS(
   SELECT
    p.id AS person_id,
    p.first_name,
    p.last_name,
    p.phone,
    COALESCE(em.participation_count,0)::int AS participation_count,
    COALESCE(em.participation_streak,0)::int AS participation_streak,
    COALESCE(em.inactivity_streak,0)::int AS inactivity_streak,
    COALESCE(em.recent_frequency,0)::numeric AS recent_frequency,
    COALESCE(em.baseline_frequency,0)::numeric AS baseline_frequency,
    COALESCE(em.trend,0)::numeric AS trend,
    COALESCE(em.deviation,0)::numeric AS deviation,
    em.last_seen,
    COALESCE(pi.attention_score,0)::numeric AS attention_score,
    COALESCE(pi.churn_probability,0)::numeric AS churn_probability,
    COALESCE(pi.next_best_action,'') AS next_best_action,
    COALESCE(ec.engagement_status,'') AS engagement_status,
    COALESCE(ec.risk_level,'low') AS risk_level,
    COALESCE(ec.resolved,false) AS case_resolved,
    COALESCE(ao.open_observations,0)::int AS open_observations,
    COALESCE(aa.open_actions,0)::int AS open_actions,
    COALESCE(aa.action_priority,0)::int AS action_priority
   FROM people p
   LEFT JOIN engagement_metrics em
    ON em.organization_id=p.organization_id AND em.person_id=p.id
   LEFT JOIN people_intelligence pi
    ON pi.organization_id=p.organization_id AND pi.person_id=p.id
   LEFT JOIN engagement_cases ec
    ON ec.organization_id=p.organization_id AND ec.person_id=p.id
   LEFT JOIN(
    SELECT organization_id,person_id,COUNT(*)::int AS open_observations
    FROM aria_observations
    WHERE status='active' AND(expires_at IS NULL OR expires_at>NOW())
    GROUP BY organization_id,person_id
   )ao ON ao.organization_id=p.organization_id AND ao.person_id=p.id
   LEFT JOIN(
    SELECT organization_id,person_id,
           COUNT(*)::int AS open_actions,
           MAX(CASE priority WHEN'critical'then 4 WHEN'high'then 3 WHEN'medium'then 2 ELSE 1 END)::int AS action_priority
    FROM aria_actions
    WHERE status IN('proposed','approved')
    GROUP BY organization_id,person_id
   )aa ON aa.organization_id=p.organization_id AND aa.person_id=p.id
   WHERE p.organization_id=$1 AND p.status='active'
  ),
  scored AS(
   SELECT *,
    CASE
     WHEN inactivity_streak>=4 THEN 'extended_absence'
     WHEN trend<=-.25 OR deviation<=-.25 THEN 'emerging_attendance_decline'
     WHEN participation_count=1 THEN 'new_relationship'
     WHEN open_observations>0 THEN 'active_signal'
     WHEN open_actions>0 THEN 'pending_action'
     ELSE NULL
    END AS signal_type
   FROM base
  )
  SELECT
   person_id,
   first_name,
   last_name,
   phone,
   participation_count,
   participation_streak,
   inactivity_streak,
   recent_frequency AS recent_attendance,
   baseline_frequency AS previous_attendance,
   last_seen AS last_attendance,
   trend,
   deviation,
   attention_score,
   churn_probability,
   next_best_action,
   engagement_status,
   risk_level,
   open_observations,
   open_actions,
   signal_type,
   CASE
    WHEN signal_type='extended_absence'
     THEN 'Attendance has been quiet longer than the recent pattern suggests.'
    WHEN signal_type='emerging_attendance_decline'
     THEN 'Recent participation is below the person''s previous pattern.'
    WHEN signal_type='new_relationship'
     THEN 'This person is newly known and may benefit from intentional welcome.'
    WHEN signal_type='active_signal'
     THEN 'ARIA has an active observation that deserves review.'
    WHEN signal_type='pending_action'
     THEN 'ARIA has a pending human-approved action for this person.'
    ELSE 'ARIA found a meaningful change worth reviewing.'
   END AS reason,
   (
    attention_score
    +action_priority*10
    +CASE WHEN inactivity_streak>0 THEN LEAST(32,inactivity_streak*8) ELSE 0 END
    +CASE WHEN trend<0 THEN LEAST(20,ABS(trend)*20) ELSE 0 END
    +CASE WHEN deviation<0 THEN LEAST(15,ABS(deviation)*15) ELSE 0 END
   )::int AS priority_score
  FROM scored
  WHERE signal_type IS NOT NULL
  ORDER BY priority_score DESC,first_name ASC
  LIMIT $2
 `,[orgId,safeLimit]);

 return result.rows;
}
