// lib/aria/careCycle.js
import pool from '../db';
import{updateEngagementMetricsForPerson}from'./engagementIntelligence';
import{computeRelationshipScore}from'./relationshipScore';
import{updatePeopleIntelligence}from'./peopleIntelligence';
import{updatePersonState}from'./stateManager';
import{generateActionsFromObservations}from'./recommendationEngine';

const BATCH=100;

export async function runCareCycle(orgId,{force=false}={}){
 if(!orgId)throw new Error('orgId required');
 const people=await pool.query(`SELECT id FROM people WHERE organization_id=$1 AND status='active' ORDER BY id LIMIT $2`,[orgId,BATCH]);
 let processed=0;
 for(const person of people.rows){
  try{
   const stale=await pool.query(`SELECT GREATEST(COALESCE((SELECT updated_at FROM engagement_metrics WHERE organization_id=$1 AND person_id=$2),'1970-01-01'::timestamptz),COALESCE((SELECT updated_at FROM people_intelligence WHERE organization_id=$1 AND person_id=$2),'1970-01-01'::timestamptz),COALESCE((SELECT updated_at FROM aria_person_state WHERE organization_id=$1 AND person_id=$2),'1970-01-01'::timestamptz)) AS updated`,[orgId,person.id]);
   const updated=stale.rows[0]?.updated?new Date(stale.rows[0].updated):new Date(0);
   if(!force&&Date.now()-updated.getTime()<5*60*1000)continue;
   await updateEngagementMetricsForPerson(person.id,orgId);
   await updatePeopleIntelligence(person.id,orgId);
   await updatePersonState(person.id,orgId);
   processed++;
  }catch(err){console.error('[ARIA] Care cycle person:',person.id,err.message)}
 }
 try{await computeRelationshipScore(orgId)}catch(err){console.error('[ARIA] Relationship cycle:',err.message)}
 try{await generateActionsFromObservations(orgId)}catch(err){console.error('[ARIA] Care action cycle:',err.message)}
 return{organizationId:orgId,processed,checked:people.rows.length,ranAt:new Date().toISOString()};
}
