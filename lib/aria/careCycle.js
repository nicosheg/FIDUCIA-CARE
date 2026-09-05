// lib/aria/careCycle.js
import pool from'../db';
import{emitAriaEvent}from'./eventEmitter';
import{processAriaEvent}from'./eventProcessor';
import{updateEngagementMetricsForPerson}from'./engagementIntelligence';
import{computeRelationshipScore}from'./relationshipScore';
import{updatePeopleIntelligence}from'./peopleIntelligence';
import{updatePersonState}from'./stateManager';
import{generateCareRecommendations}from'./careEngine';

async function reconcileParticipationEvents(orgId){
 const r=await pool.query(`SELECT pr.id,pr.person_id,pr.session_id FROM participation_records pr JOIN people p ON p.id=pr.person_id AND p.organization_id=pr.organization_id WHERE pr.organization_id=$1 AND COALESCE(p.status,'active')='active' AND NOT EXISTS(SELECT 1 FROM aria_events e WHERE e.organization_id=pr.organization_id AND e.event_key=$2||pr.id::text) ORDER BY pr.occurred_at ASC`,[orgId,'participation:']);
 let created=0;
 for(const row of r.rows){
  try{
   const event=await emitAriaEvent({organizationId:orgId,personId:row.person_id,type:'PARTICIPATION_CONFIRMED',source:'participation_reconciliation',metadata:{participation_id:row.id,session_id:row.session_id},eventKey:`participation:${row.id}:confirmed`});
   if(event){await processAriaEvent(event);created++}
  }catch(e){console.error('[ARIA] reconcile',row.id,e.message)}
 }
 return created;
}

export async function runCareCycle(orgId,{force=false}={}){
 if(!orgId)throw new Error('orgId required');
 const people=await pool.query(`SELECT id FROM people WHERE organization_id=$1 AND status='active' ORDER BY id LIMIT 1000`,[orgId]);
 const ids=people.rows.map(x=>x.id);
 if(!ids.length)return{organizationId:orgId,processed:0,checked:0,observations:0,actions:0,ranAt:new Date().toISOString()};
 const observations=await reconcileParticipationEvents(orgId);
 for(const id of ids)try{await updateEngagementMetricsForPerson(id,orgId)}catch(e){console.error('[ARIA] metrics',id,e.message)}
 try{await computeRelationshipScore(orgId)}catch(e){console.error('[ARIA] relationship',e.message)}
 let processed=0;
 for(const id of ids)try{await updatePeopleIntelligence(id,orgId);await updatePersonState(id,orgId);processed++}catch(e){console.error('[ARIA] intelligence',id,e.message)}
 let actions=[];
 try{actions=await generateCareRecommendations(orgId)}catch(e){console.error('[ARIA] care recommendations',e.message)}
 return{organizationId:orgId,processed,checked:ids.length,observations,actions:actions.length,ranAt:new Date().toISOString()};
                                                                                                                                                               }
