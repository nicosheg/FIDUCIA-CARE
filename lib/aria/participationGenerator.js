// lib/aria/participationGenerator.js
import pool from'../db';
import{updateEngagementMetricsForPerson}from'./engagementIntelligence';
import{computeRelationshipScore}from'./relationshipScore';
import{updatePeopleIntelligence}from'./peopleIntelligence';
import{updatePersonState}from'./stateManager';
import{generateCareRecommendations}from'./careEngine';

export async function generateParticipationFromSession(sessionId,orgId){
 if(!sessionId||!orgId)throw new Error('sessionId and orgId are required');
 const client=await pool.connect(),personIds=new Set();
 try{
  await client.query('BEGIN');
  const s=await client.query(`SELECT id FROM sessions WHERE id=$1 AND organization_id=$2 LIMIT 1`,[sessionId,orgId]);
  if(!s.rows.length)throw new Error('Session does not belong to organization');
  const a=await client.query(`SELECT ar.people_id,ar.attendance_date FROM attendance_records ar JOIN people p ON p.id=ar.people_id AND p.organization_id=ar.organization_id WHERE ar.session_id=$1 AND ar.organization_id=$2 AND ar.confirmed=true AND ar.present=true AND COALESCE(p.status,'active')<>'merged'`,[sessionId,orgId]);
  for(const row of a.rows){
   await client.query(`INSERT INTO participation_records(organization_id,person_id,session_id,participation_type,value,occurred_at)VALUES($1,$2,$3,'attendance',$4,$5) ON CONFLICT DO NOTHING`,[orgId,row.people_id,sessionId,JSON.stringify({present:true,source:'attendance_confirmation'}),row.attendance_date]);
   personIds.add(row.people_id);
  }
  await client.query('COMMIT');
 }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
 for(const id of personIds)try{await updateEngagementMetricsForPerson(id,orgId)}catch(e){console.error('[ARIA] metrics',e.message)}
 try{await computeRelationshipScore(orgId)}catch(e){console.error('[ARIA] relationship',e.message)}
 for(const id of personIds)try{await updatePeopleIntelligence(id,orgId);await updatePersonState(id,orgId)}catch(e){console.error('[ARIA] intelligence',e.message)}
 try{await generateCareRecommendations(orgId)}catch(e){console.error('[ARIA] care',e.message)}
 return{session_id:sessionId,processed:personIds.size};
                             }
