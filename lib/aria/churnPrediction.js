// lib/aria/churnPrediction.js
import pool from '../db';
import{updatePeopleIntelligence}from'./peopleIntelligence';

export async function updateChurnPredictions(orgId){
 if(!orgId)throw new Error('orgId required');

 const people=await pool.query(`
  SELECT id
  FROM people
  WHERE organization_id=$1 AND status='active'
  ORDER BY id
 `,[orgId]);

 for(const person of people.rows){
  await updatePeopleIntelligence(person.id,orgId);
 }

 return people.rows.length;
}

export async function getChurnRisk(orgId,threshold=.7,limit=20){
 if(!orgId)throw new Error('orgId required');
 const safeThreshold=Number(threshold)>1?Number(threshold)/100:Number(threshold);
 const safeLimit=Math.min(Math.max(Number(limit)||20,1),100);

 const result=await pool.query(`
  SELECT
   pi.person_id,
   pi.churn_probability,
   pi.engagement_score,
   pi.attention_score,
   pi.attention_level,
   pi.lifecycle_state,
   pi.next_best_action,
   p.first_name,
   p.last_name,
   p.phone
  FROM people_intelligence pi
  JOIN people p ON p.id=pi.person_id AND p.organization_id=pi.organization_id
  WHERE pi.organization_id=$1
    AND pi.churn_probability>=$2
    AND p.status='active'
  ORDER BY pi.churn_probability DESC
  LIMIT $3
 `,[orgId,Math.max(0,Math.min(1,safeThreshold)),safeLimit]);

 return result.rows;
}
