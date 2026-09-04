// lib/aria/dailyBriefing.js
import pool from '../db';
import{updateEngagementMetrics}from'./engagementIntelligence';
import{updateEngagementCases}from'./engagementCases';
import{computeRelationshipScore}from'./relationshipScore';
import{updatePeopleIntelligence}from'./peopleIntelligence';
import{getPriorityQueue}from'./priorityQueue';

export async function generateDailyBriefing(orgId){
 if(!orgId)throw new Error('orgId required');

 await updateEngagementMetrics(orgId);
 await updateEngagementCases(orgId);
 await computeRelationshipScore(orgId);

 const people=await pool.query(`SELECT id FROM people WHERE organization_id=$1 AND status='active'`,[orgId]);
 for(const p of people.rows){
  try{await updatePeopleIntelligence(p.id,orgId)}catch(err){console.error('[DailyBriefing] Intelligence:',err.message)}
 }

 const[metricsRes,casesRes,priority]=await Promise.all([
  pool.query(`
   SELECT
    COUNT(*)::int AS total_people,
    COUNT(*) FILTER(WHERE participation_count>0)::int AS participants,
    COUNT(*) FILTER(WHERE participation_count=1)::int AS new_people,
    COUNT(*) FILTER(WHERE inactivity_streak=0)::int AS active_people,
    COUNT(*) FILTER(WHERE inactivity_streak>=4)::int AS inactive_people
   FROM engagement_metrics
   WHERE organization_id=$1
  `,[orgId]),
  pool.query(`
   SELECT risk_level,COUNT(*)::int AS count
   FROM engagement_cases
   WHERE organization_id=$1 AND resolved=false
   GROUP BY risk_level
  `,[orgId]),
  getPriorityQueue(orgId,5)
 ]);

 const metrics=metricsRes.rows[0]||{};
 const cases={};
 casesRes.rows.forEach(r=>cases[r.risk_level]=Number(r.count)||0);

 const recommendations=priority.map(p=>({
  personId:p.person_id,
  name:[p.first_name,p.last_name].filter(Boolean).join(' '),
  type:p.signal_type,
  reason:p.reason,
  priorityScore:p.priority_score
 }));

 const summary=[
  `People: ${Number(metrics.total_people)||0}.`,
  `Participants: ${Number(metrics.participants)||0}.`,
  `New relationships: ${Number(metrics.new_people)||0}.`,
  `High risk: ${cases.high||0}.`,
  `Critical risk: ${cases.critical||0}.`,
  `Priority opportunities: ${recommendations.length}.`
 ].join('\n');

 const brief=(await pool.query(`
  INSERT INTO daily_briefings(organization_id,summary,metrics,recommendations,generated_at,created_at)
  VALUES($1,$2,$3,$4,NOW(),NOW())
  RETURNING id
 `,[orgId,summary,{...metrics,risk_cases:cases},recommendations])).rows[0];

 return{id:brief.id,summary,metrics:{...metrics,risk_cases:cases},recommendations};
    }
