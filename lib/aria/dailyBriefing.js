// lib/aria/dailyBriefing.js
import pool from'../db';
import{runCareCycle}from'./careCycle';
import{getPriorityQueue}from'./priorityQueue';

export async function generateDailyBriefing(orgId){
 if(!orgId)throw new Error('orgId required');
 await runCareCycle(orgId);
 const[metricsRes,priority]=await Promise.all([
  pool.query(`SELECT COUNT(*)::int AS total_people,COUNT(*) FILTER(WHERE participation_count>0)::int AS participants,COUNT(*) FILTER(WHERE participation_count=1)::int AS new_people,COUNT(*) FILTER(WHERE inactivity_streak=0)::int AS active_people,COUNT(*) FILTER(WHERE inactivity_streak>=4)::int AS inactive_people FROM engagement_metrics WHERE organization_id=$1`,[orgId]),
  getPriorityQueue(orgId,5)
 ]);
 const metrics=metricsRes.rows[0]||{};
 const recommendations=priority.map(p=>({
  personId:p.person_id,
  name:[p.first_name,p.last_name].filter(Boolean).join(' '),
  type:p.signal_type,
  reason:p.reason,
  priorityScore:p.priority_score
 }));
 const summary=recommendations.length
  ?`ARIA found ${recommendations.length} care opportunit${recommendations.length===1?'y':'ies'} worth reviewing today.`
  :Number(metrics.total_people)
   ?`ARIA is keeping relationship context current for your people.`
   :'ARIA is ready. Your organization is just getting started.';
 const result=await pool.query(`INSERT INTO daily_briefings(organization_id,summary,metrics,recommendations,generated_at,created_at)VALUES($1,$2,$3,$4,NOW(),NOW()) RETURNING id`,[orgId,summary,metrics,recommendations]);
 return{id:result.rows[0].id,summary,metrics,recommendations};
   }
