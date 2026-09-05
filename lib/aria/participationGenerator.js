// lib/aria/participationGenerator.js
import pool from'../db';
import{emitAriaEvent}from'./eventEmitter';
import{processAriaEvent}from'./eventProcessor';
import{updateEngagementMetricsForPerson}from'./engagementIntelligence';
import{computeRelationshipScore}from'./relationshipScore';
import{updatePeopleIntelligence}from'./peopleIntelligence';
import{updatePersonState}from'./stateManager';
import{generateCareRecommendations}from'./careEngine';

export async function generateParticipationFromSession(sessionId,orgId){
 if(!sessionId||!orgId)throw new Error('sessionId and orgId are required');
 const client=await pool.connect(),records=[];
 try{
  await client.query('BEGIN');
  const s=await client.query(`SELECT id FROM sessions WHERE id=$1 AND organization_id=$2 LIMIT 1`,[sessionId,orgId]);
  if(!s.rows.length)throw new Error('Session does not belong to organization');
  const a=await client.query(`SELECT ar.id,ar.people_id,ar.attendance_date FROM attendance_records ar JOIN people p ON p.id=ar.people_id AND p.organization_id=ar.organization_id WHERE ar.session_id=$1 AND ar.organization_id=$2 AND ar.confirmed=true AND ar.present=true AND COALESCE(p.status,'active')<>'merged'`,[sessionId,orgId]);
  for(const row of a.rows){
   const inserted=await client.query(`INSERT INTO participation_records(organization_id,person_id,session_id,participation_type,value,occurred_at) VALUES($1,$2,$3,'attendance',$4,$5) ON CONFLICT DO NOTHING RETURNING id`,[orgId,row.people_id,sessionId,JSON.stringify({present:true,source:'attendance_confirmation'}),row.attendance_date]);
   records.push({participationId:inserted.rows[0]?.id||null,personId:row.people_id});
  }
  await client.query('COMMIT');
 }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
 const personIds=[...new Set(records.map(x=>x.personId))];
 for(const row of records){
  if(!row.participationId)continue;
  try{
   const event=await emitAriaEvent({organizationId:orgId,personId:row.personId,type:'PARTICIPATION_CONFIRMED',source:'attendance',metadata:{session_id:sessionId,participation_id:row.participationId},eventKey:`participation:${row.participationId}:confirmed`});
   if(event)await processAriaEvent(event);
  }catch(e){console.error('[ARIA] participation event',row.personId,e.message)}
 }
 for(const id of personIds)try{await updateEngagementMetricsForPerson(id,orgId)}catch(e){console.error('[ARIA] metrics',e.message)}
 try{await computeRelationshipScore(orgId)}catch(e){console.error('[ARIA] relationship',e.message)}
 for(const id of personIds)try{await updatePeopleIntelligence(id,orgId);await updatePersonState(id,orgId)}catch(e){console.error('[ARIA] intelligence',e.message)}
 try{await generateCareRecommendations(orgId)}catch(e){console.error('[ARIA] care',e.message)}
 return{session_id:sessionId,processed:personIds.length,events:records.filter(x=>x.participationId).length};
    }
