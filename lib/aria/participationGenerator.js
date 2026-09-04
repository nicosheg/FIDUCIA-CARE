// lib/aria/participationGenerator.js
import pool from '../db';
import{updateEngagementMetricsForPerson}from'./engagementIntelligence';
import{updateEngagementCases}from'./engagementCases';
import{computeRelationshipScore}from'./relationshipScore';
import{updatePeopleIntelligence}from'./peopleIntelligence';
import{updatePersonState}from'./stateManager';
import{generateActionsFromObservations}from'./recommendationEngine';

export async function generateParticipationFromSession(sessionId,orgId){
 if(!sessionId||!orgId)throw new Error('sessionId and orgId are required');

 const client=await pool.connect();
 const personIds=new Set();

 try{
  await client.query('BEGIN');

  const session=await client.query(`SELECT id FROM sessions WHERE id=$1 AND organization_id=$2 LIMIT 1`,[sessionId,orgId]);
  if(!session.rows.length)throw new Error('Session does not belong to organization');

  const attendance=await client.query(`
   SELECT ar.people_id,ar.attendance_date
   FROM attendance_records ar
   JOIN people p ON p.id=ar.people_id AND p.organization_id=ar.organization_id
   WHERE ar.session_id=$1
     AND ar.organization_id=$2
     AND ar.confirmed=true
     AND ar.present=true
     AND COALESCE(p.status,'active')<>'merged'
  `,[sessionId,orgId]);

  for(const row of attendance.rows){
   await client.query(`
    INSERT INTO participation_records(
     organization_id,person_id,session_id,participation_type,value,occurred_at
    )VALUES($1,$2,$3,'attendance',$4,$5)
    ON CONFLICT DO NOTHING
   `,[
    orgId,
    row.people_id,
    sessionId,
    JSON.stringify({present:true,source:'attendance_confirmation'}),
    row.attendance_date
   ]);
   personIds.add(row.people_id);
  }

  await client.query('COMMIT');
 }catch(err){
  try{await client.query('ROLLBACK')}catch{}
  throw err;
 }finally{
  client.release();
 }

 for(const personId of personIds){
  try{
   await updateEngagementMetricsForPerson(personId,orgId);
  }catch(err){console.error('[ARIA] Engagement metrics:',err.message)}
 }

 try{
  await updateEngagementCases(orgId);
 }catch(err){console.error('[ARIA] Engagement cases:',err.message)}

 try{
  await computeRelationshipScore(orgId);
 }catch(err){console.error('[ARIA] Relationship scores:',err.message)}

 for(const personId of personIds){
  try{
   await updatePeopleIntelligence(personId,orgId);
   await updatePersonState(personId,orgId);
  }catch(err){console.error(`[ARIA] Intelligence pipeline ${personId}:`,err.message)}
 }

 try{
  await generateActionsFromObservations(orgId);
 }catch(err){console.error('[ARIA] Action generation:',err.message)}

 return{session_id:sessionId,processed:personIds.size};
    }
