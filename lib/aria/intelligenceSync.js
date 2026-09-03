// lib/aria/intelligenceSync.js
import { updateEngagementMetricsForPerson } from './engagementIntelligence';
import { updatePeopleIntelligence } from './peopleIntelligence';
import { updatePersonState } from './stateManager';

export async function syncPersonIntelligence(personId,orgId){
 if(!personId||!orgId)throw new Error('personId and orgId are required');

 const engagement=await updateEngagementMetricsForPerson(personId,orgId);
 const intelligence=await updatePeopleIntelligence(personId,orgId);
 const state=await updatePersonState(personId,orgId);

 return{engagement,intelligence,state};
}

export async function syncOrganizationIntelligence(orgId,options={}){
 if(!orgId)throw new Error('orgId is required');

 const chunkSize=Math.max(1,Math.min(Number(options.chunkSize)||250,1000));
 let lastId=null;
 let processed=0;

 while(true){
  const result=await (await import('../db')).default.query(`
   SELECT id
   FROM people
   WHERE organization_id=$1
     AND COALESCE(status,'active')='active'
     AND ($2::uuid IS NULL OR id>$2::uuid)
   ORDER BY id
   LIMIT $3
  `,[orgId,lastId,chunkSize]);

  if(!result.rows.length)break;

  for(const person of result.rows){
   await syncPersonIntelligence(person.id,orgId);
   processed++;
  }

  lastId=result.rows[result.rows.length-1].id;
 }

 return processed;
}
