// lib/aria/stateManager.js
import pool from '../db';

const LEVEL={0:'none',1:'low',2:'medium',3:'high',4:'critical'};
const level=v=>LEVEL[Math.max(0,Math.min(4,Number(v)||0))]||'none';

function relationshipState(score){
 const n=Number(score)||0;
 if(n>=80)return'strong';
 if(n>=60)return'healthy';
 if(n>=40)return'developing';
 if(n>=20)return'weak';
 return'unknown';
}

export async function updatePersonState(personId,orgId,client=null){
 if(!personId||!orgId)throw new Error('personId and orgId are required');
 const db=client||pool;
 const[person,intelligence,metrics,relationship,observations,actions]=await Promise.all([
  db.query(`SELECT id,status FROM people WHERE id=$1 AND organization_id=$2 LIMIT 1`,[personId,orgId]),
  db.query(`SELECT * FROM people_intelligence WHERE organization_id=$1 AND person_id=$2 LIMIT 1`,[orgId,personId]),
  db.query(`SELECT * FROM engagement_metrics WHERE organization_id=$1 AND person_id=$2 LIMIT 1`,[orgId,personId]),
  db.query(`SELECT score,relationship_state FROM relationship_scores WHERE organization_id=$1 AND person_id=$2 ORDER BY calculated_at DESC LIMIT 1`,[orgId,personId]),
  db.query(`SELECT COUNT(*)::int AS count,COALESCE(MAX(attention_score),0)::float AS max_attention FROM aria_observations WHERE organization_id=$1 AND person_id=$2 AND status='active' AND(expires_at IS NULL OR expires_at>NOW())`,[orgId,personId]),
  db.query(`SELECT COUNT(*)::int AS count FROM aria_actions WHERE organization_id=$1 AND person_id=$2 AND status IN('proposed','approved')`,[orgId,personId])
 ]);
 if(!person.rows.length)throw new Error('Person not found');
 const i=intelligence.rows[0]||{};
 const m=metrics.rows[0]||{};
 const r=relationship.rows[0]||{};
 const o=observations.rows[0]||{};
 const openActions=Number(actions.rows[0]?.count)||0;
 const attention=Math.max(Number(i.attention_score)||0,Number(o.max_attention)||0);
 const engagementState=i.lifecycle_state||'new';
 const relationshipStatus=r.relationship_state||relationshipState(r.score);
 const careState=attention>=80?'urgent_action_required':attention>=60?'needs_human_review':attention>=35?'care_opportunity':'healthy';
 const followupState=i.next_best_action?'recommended':'none';
 const lastMeaningfulEvent=m.last_meaningful_event||m.last_seen||null;
 await db.query(`INSERT INTO aria_person_state(person_id,organization_id,engagement_state,care_state,relationship_state,followup_state,attention_level,open_observation_count,open_action_count,last_meaningful_event,lifecycle_state,engagement_score,churn_probability,next_best_action,attention_reason,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,$14,NOW()) ON CONFLICT(organization_id,person_id) DO UPDATE SET engagement_state=EXCLUDED.engagement_state,care_state=EXCLUDED.care_state,relationship_state=EXCLUDED.relationship_state,followup_state=EXCLUDED.followup_state,attention_level=EXCLUDED.attention_level,open_observation_count=EXCLUDED.open_observation_count,open_action_count=EXCLUDED.open_action_count,last_meaningful_event=EXCLUDED.last_meaningful_event,lifecycle_state=EXCLUDED.lifecycle_state,engagement_score=EXCLUDED.engagement_score,churn_probability=0,next_best_action=EXCLUDED.next_best_action,attention_reason=EXCLUDED.attention_reason,updated_at=NOW()`,[
  personId,orgId,engagementState,careState,relationshipStatus,followupState,level(attention),Number(o.count)||0,openActions,lastMeaningfulEvent,i.lifecycle_state||'new',Number(i.engagement_score)||0,i.next_best_action||null,i.action_reason||null
 ]);
 return{personId,organizationId:orgId,engagementState,careState,relationshipState:relationshipStatus,followupState,attentionLevel:level(attention),openObservationCount:Number(o.count)||0,openActionCount:openActions,lastMeaningfulEvent,lifecycleState:i.lifecycle_state||'new',engagementScore:Number(i.engagement_score)||0,nextBestAction:i.next_best_action||null,attentionReason:i.action_reason||null};
  }
