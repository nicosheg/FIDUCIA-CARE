// lib/aria/eventProcessor.js
import pool from'../db';
import{createObservation}from'./observationEngine';
import{updatePeopleIntelligence}from'./peopleIntelligence';
import{updatePersonState}from'./stateManager';
import{generateCareRecommendations}from'./careEngine';

export async function processAriaEvent(event,client=null){
 if(!event)throw new Error('ARIA event is required');
 const{ id:eventId,organization_id:orgId,person_id:personId,type,source,metadata={} }=event;
 if(!eventId||!orgId||!type)throw new Error('ARIA event id, organization_id and type are required');
 if(!personId)return null;
 const owns=!client;
 const db=client||await pool.connect();
 let observationId=null;
 try{
  if(owns)await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))',[String(orgId),String(eventId)]);
  const existing=await db.query(`SELECT id FROM aria_observations WHERE organization_id=$1 AND metadata->>'source_event_id'=$2 LIMIT 1`,[orgId,String(eventId)]);
  if(existing.rows.length){
   observationId=existing.rows[0].id;
   if(owns)await db.query('COMMIT');
   if(owns)try{await generateCareRecommendations(orgId)}catch(e){console.error('[ARIA] care',e.message)}
   return observationId;
  }
  let o=null;
  if(type==='PERSON_CREATED')o={type:'NEW_PERSON',confidence:Math.max(0,Math.min(1,Number(metadata.confidence??70)/100)),severity:'medium',urgency:'medium',evidence:{sources:source?[source]:[],facts:['Person became known to the organization'],inference:'New person discovered'}};
  else if(type==='PERSON_UPDATED')o={type:'PERSON_UPDATE',confidence:.9,severity:'low',urgency:'low',evidence:{sources:source?[source]:[],facts:['Person information changed'],inference:'Person context changed'}};
  else if(type==='PARTICIPATION_CONFIRMED')o={type:'PARTICIPATION_CONFIRMED',confidence:1,severity:'low',urgency:'low',evidence:{sources:source?[source]:[],facts:['Confirmed participation recorded'],inference:'Person participated'}};
  else if(type==='CARE_FEEDBACK')o={type:'CARE_FEEDBACK',confidence:1,severity:'low',urgency:'low',evidence:{sources:source?[source]:[],facts:['Human care feedback recorded'],inference:'Care approach now has human evidence'}};
  else{
   if(owns)await db.query('COMMIT');
   return null;
  }
  observationId=await createObservation({organizationId:orgId,personId,type:o.type,confidence:o.confidence,severity:o.severity,urgency:o.urgency,evidence:o.evidence,sourceEventId:eventId},db);
  await updatePeopleIntelligence(personId,orgId,db);
  await updatePersonState(personId,orgId,db);
  if(owns)await db.query('COMMIT');
  if(owns)try{await generateCareRecommendations(orgId)}catch(e){console.error('[ARIA] care',e.message)}
  return observationId;
 }catch(err){
  if(owns)try{await db.query('ROLLBACK')}catch{}
  throw err;
 }finally{
  if(owns)db.release();
 }
 }
