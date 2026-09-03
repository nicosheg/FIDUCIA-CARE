// lib/aria/stateManager.js
import pool from '../db';

const RISK={low:1,medium:2,high:3,critical:4};
const LEVEL={0:'none',1:'low',2:'medium',3:'high',4:'critical'};

function level(v){
 const n=Math.max(0,Math.min(4,Number(v)||0));
 return LEVEL[n]||'none';
}

function relationshipState(score){
 const n=Number(score)||0;
 if(n>=80)return 'strong';
 if(n>=60)return 'healthy';
 if(n>=40)return 'developing';
 if(n>=20)return 'weak';
 return 'unknown';
}

function riskFromAttention(value){
 const n=Number(value)||0;
 return n>=80?4:n>=60?3:n>=35?2:n>0?1:0;
}

export async function updatePersonState(personId,orgId,client=null){
 if(!personId||!orgId)throw new Error('personId and orgId are required');

 const db=client||pool;

 const [person,intelligence,metrics,relationship,observations,actions]=await Promise.all([
  db.query(`
   SELECT id,status
   FROM people
   WHERE id=$1 AND organization_id=$2
   LIMIT 1
  `,[personId,orgId]),
  db.query(`
   SELECT *
   FROM people_intelligence
   WHERE organization_id=$1 AND person_id=$2
   LIMIT 1
  `,[orgId,personId]),
  db.query(`
   SELECT *
   FROM engagement_metrics
   WHERE organization_id=$1 AND person_id=$2
   LIMIT 1
  `,[orgId,personId]),
  db.query(`
   SELECT score,relationship_state
   FROM relationship_scores
   WHERE organization_id=$1 AND person_id=$2
   ORDER BY calculated_at DESC
   LIMIT 1
  `,[orgId,personId]),
  db.query(`
   SELECT
    COUNT(*)::int AS count,
    COALESCE(MAX(attention_score),0)::float AS max_attention
   FROM aria_observations
   WHERE organization_id=$1
     AND person_id=$2
     AND status='active'
     AND (expires_at IS NULL OR expires_at>NOW())
  `,[orgId,personId]),
  db.query(`
   SELECT COUNT(*)::int AS count
   FROM aria_actions
   WHERE organization_id=$1
     AND person_id=$2
     AND status IN('proposed','approved','queued')
  `,[orgId,personId])
 ]);

 if(!person.rows.length)throw new Error('Person not found');

 const i=intelligence.rows[0]||{};
 const m=metrics.rows[0]||{};
 const r=relationship.rows[0]||{};
 const o=observations.rows[0]||{};
 const openActions=Number(actions.rows[0]?.count)||0;

 const attentionScore=Number(i.attention_score)||0;
 const attentionRisk=Math.max(
  riskFromAttention(attentionScore),
  riskFromAttention(o.max_attention)
 );

 const engagementState=i.lifecycle_state||
  m.engagement_status||
  'new';

 const relationshipScore=Number(r.score)||0;
 const relationshipStatus=r.relationship_state||
  relationshipState(relationshipScore);

 const careState=
  attentionRisk>=4?'urgent_action_required':
  attentionRisk>=3?'at_risk':
  attentionRisk>=2?'needs_attention':
  'active';

 const followupState=
  i.next_best_action&&i.next_best_action!=='observe'
   ?'recommended'
   :'none';

 const lastMeaningfulEvent=
  m.last_meaningful_event||
  m.last_seen||
  null;

 await db.query(`
  INSERT INTO aria_person_state(
   person_id,
   organization_id,
   engagement_state,
   care_state,
   relationship_state,
   followup_state,
   attention_level,
   open_observation_count,
   open_action_count,
   last_meaningful_event,
   lifecycle_state,
   engagement_score,
   churn_probability,
   next_best_action,
   attention_reason,
   updated_at
  )
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
  ON CONFLICT(organization_id,person_id)
  DO UPDATE SET
   engagement_state=EXCLUDED.engagement_state,
   care_state=EXCLUDED.care_state,
   relationship_state=EXCLUDED.relationship_state,
   followup_state=EXCLUDED.followup_state,
   attention_level=EXCLUDED.attention_level,
   open_observation_count=EXCLUDED.open_observation_count,
   open_action_count=EXCLUDED.open_action_count,
   last_meaningful_event=EXCLUDED.last_meaningful_event,
   lifecycle_state=EXCLUDED.lifecycle_state,
   engagement_score=EXCLUDED.engagement_score,
   churn_probability=EXCLUDED.churn_probability,
   next_best_action=EXCLUDED.next_best_action,
   attention_reason=EXCLUDED.attention_reason,
   updated_at=NOW()
 `,[
  personId,
  orgId,
  engagementState,
  careState,
  relationshipStatus,
  followupState,
  level(attentionRisk),
  Number(o.count)||0,
  openActions,
  lastMeaningfulEvent,
  i.lifecycle_state||'new',
  Number(i.engagement_score)||0,
  Number(i.churn_probability)||0,
  i.next_best_action||null,
  i.action_reason||null
 ]);

 return{
  personId,
  organizationId:orgId,
  engagementState,
  careState,
  relationshipState:relationshipStatus,
  followupState,
  attentionLevel:level(attentionRisk),
  openObservationCount:Number(o.count)||0,
  openActionCount:openActions,
  lastMeaningfulEvent,
  lifecycleState:i.lifecycle_state||'new',
  engagementScore:Number(i.engagement_score)||0,
  churnProbability:Number(i.churn_probability)||0,
  nextBestAction:i.next_best_action||null,
  attentionReason:i.action_reason||null,
  engagement:{
   participationCount:Number(m.participation_count)||0,
   participationRate:Number(m.participation_rate)||0,
   participationStreak:Number(m.participation_streak)||0,
   inactivityStreak:Number(m.inactivity_streak)||0,
   baselineFrequency:Number(m.baseline_frequency)||0,
   recentFrequency:Number(m.recent_frequency)||0,
   trend:Number(m.trend)||0,
   deviation:Number(m.deviation)||0,
   confidence:Number(m.confidence)||0
  },
  relationship:{
   score:relationshipScore,
   state:relationshipStatus
  }
 };
   }
