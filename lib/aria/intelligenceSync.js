// lib/aria/intelligenceSync.js
import { updateEngagementMetricsForPerson } from './engagementIntelligence';
import { updatePersonState } from './stateManager';

export async function syncPersonIntelligence(personId,orgId){
  if(!personId||!orgId){
    throw new Error('personId and orgId are required');
  }

  const engagement=await updateEngagementMetricsForPerson(
    personId,
    orgId
  );

  const state=await updatePersonState(
    personId,
    orgId
  );

  return{
    engagement,
    state
  };
}
