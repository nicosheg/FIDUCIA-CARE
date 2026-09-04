// lib/aria/careCycle.js
import pool from'../db';
import{updateEngagementMetricsForPerson}from'./engagementIntelligence';
import{computeRelationshipScore}from'./relationshipScore';
import{updatePeopleIntelligence}from'./peopleIntelligence';
import{updatePersonState}from'./stateManager';
import{generateCareRecommendations}from'./careEngine';

export async function runCareCycle(orgId,{force=false}={}){
 if(!orgId)throw new Error('orgId required');
 const people=await pool.query(`SELECT id FROM people WHERE organization_id=$1 AND status='active' ORDER BY id LIMIT 1000`,[orgId]);
 const ids=people.rows.map(x=>x.id);
 if(!ids.length)return{organizationId:orgId,processed:0,actions:0,ranAt:new Date().toISOString()};
 for(const id of ids){
  try{await updateEngagementMetricsForPerson(id,orgId)}catch(e){console.error('[ARIA] metrics',id,e.message)}
 }
 try{await computeRelationshipScore(orgId)}catch(e){console.error('[ARIA] relationship',e.message)}
 let processed=0;
 for(const id of ids){
  try{await updatePeopleIntelligence(id,orgId);await updatePersonState(id,orgId);processed++}catch(e){console.error('[ARIA] intelligence',id,e.message)}
 }
 let actions=[];
 try{actions=await generateCareRecommendations(orgId)}catch(e){console.error('[ARIA] care recommendations',e.message)}
 return{organizationId:orgId,processed,checked:ids.length,actions:actions.length,ranAt:new Date().toISOString()};
  }
