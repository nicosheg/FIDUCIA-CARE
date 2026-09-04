// lib/aria/peopleIntelligence.js
import pool from '../db';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const level=s=>s>=80?'critical':s>=60?'high':s>=35?'medium':s>0?'low':'none';

function feedbackEffect(f){
 const positive=Number(f.positive)||0;
 const negative=Number(f.negative)||0;
 const helpful=Number(f.helpful)||0;
 const ineffective=Number(f.ineffective)||0;
 const total=Number(f.total)||0;
 if(!total)return{effect:0,confidence:0};
 return{effect:clamp((positive+helpful-negative-ineffective)/Math.max(1,total),-1,1),confidence:clamp(total/10,0,1)};
}

function calculate(m,o,r,f){
 const count=Number(m.participation_count)||0;
 const rate=Number(m.participation_rate)||0;
 const trend=Number(m.trend)||0;
 const deviation=Number(m.deviation)||0;
 const relationship=Number(r.score)||0;
 const observationAttention=Number(o.max_attention)||0;
 const severity=Number(o.max_severity)||0;
 const feedback=feedbackEffect(f);
 let relationshipScore=relationship;
 if(!relationshipScore&&count)relationshipScore=clamp(45+Math.min(35,count*4)+Math.max(0,trend)*10+feedback.effect*8,0,100);
 let engagement=clamp(Math.round(50+rate*.35+Math.max(0,trend)*15+Math.max(0,relationshipScore-50)*.2-Math.max(0,-trend)*20+feedback.effect*10),0,100);
 let attention=severity*12+observationAttention*.45+Math.max(0,-trend)*12+Math.max(0,-deviation)*8+Math.max(0,-feedback.effect)*8;
 attention=clamp(attention,0,100);
 return{engagementScore:engagement,relationshipScore:Number(relationshipScore.toFixed(2)),attentionScore:Number(attention.toFixed(2)),attentionLevel:level(attention),feedback};
}

function lifecycle(m){
 const count=Number(m.participation_count)||0;
 if(!count)return'new';
 if(count===1)return'onboarding';
 if(count>=4)return'established';
 return'developing';
}

function actionFor({lifecycleState,attentionLevel,feedback,relationshipScore,meaningfulMemoryCount}){
 if(attentionLevel==='critical')return{action:'human_review',reason:'ARIA found a strong care signal that deserves human judgment.'};
 if(attentionLevel==='high')return{action:'human_review',reason:'ARIA found a meaningful change or care signal worth reviewing.'};
 if(lifecycleState==='new')return{action:'welcome',reason:'This person is newly known and the relationship can begin intentionally.'};
 if(lifecycleState==='onboarding')return{action:'build_relationship',reason:'The relationship is still forming and a thoughtful human connection may help.'};
 if(feedback.effect<-.25)return{action:'adjust_care_approach',reason:'Recent human feedback suggests the previous approach may not have helped.'};
 if(meaningfulMemoryCount>0&&relationshipScore>=60)return{action:'use_relationship_context',reason:'ARIA has meaningful relationship context that can help the next human interaction feel personal.'};
 if(relationshipScore>=80)return{action:null,reason:null};
 return{action:null,reason:null};
}

export async function updatePeopleIntelligence(personId,orgId,client=null){
 if(!personId||!orgId)throw new Error('personId and orgId are required');
 const db=client||pool;
 const[person,metrics,observations,relationship,feedback,memory]=await Promise.all([
  db.query(`SELECT id,status FROM people WHERE id=$1 AND organization_id=$2 LIMIT 1`,[personId,orgId]),
  db.query(`SELECT * FROM engagement_metrics WHERE organization_id=$1 AND person_id=$2 LIMIT 1`,[orgId,personId]),
  db.query(`SELECT COALESCE(MAX(attention_score),0)::float AS max_attention,COALESCE(MAX(CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END),0)::int AS max_severity FROM aria_observations WHERE organization_id=$1 AND person_id=$2 AND status='active' AND(expires_at IS NULL OR expires_at>NOW())`,[orgId,personId]),
  db.query(`SELECT score,relationship_state FROM relationship_scores WHERE organization_id=$1 AND person_id=$2 ORDER BY calculated_at DESC LIMIT 1`,[orgId,personId]),
  db.query(`SELECT COUNT(*) FILTER(WHERE feedback_type IN('positive','helpful','worked','relationship_strengthened'))::int AS positive,COUNT(*) FILTER(WHERE feedback_type IN('negative','ineffective','did_not_work'))::int AS negative,COUNT(*) FILTER(WHERE feedback_type='helpful')::int AS helpful,COUNT(*) FILTER(WHERE feedback_type IN('ineffective','did_not_work'))::int AS ineffective,COUNT(*)::int AS total FROM care_feedback WHERE organization_id=$1 AND person_id=$2 AND observed_at>=NOW()-INTERVAL '180 days'`,[orgId,personId]),
  db.query(`SELECT COUNT(*)::int AS count FROM person_memory WHERE organization_id=$1 AND person_id=$2 AND active=true`,[orgId,personId])
 ]);
 if(!person.rows.length)throw new Error('Person not found');
 const m=metrics.rows[0]||{};
 const o=observations.rows[0]||{};
 const r=relationship.rows[0]||{};
 const f=feedback.rows[0]||{};
 const memoryCount=Number(memory.rows[0]?.count)||0;
 const values=calculate(m,o,r,f);
 const lifecycleState=lifecycle(m);
 const action=actionFor({lifecycleState,attentionLevel:values.attentionLevel,feedback:values.feedback,relationshipScore:values.relationshipScore,meaningfulMemoryCount:memoryCount});
 const evidence={
  model:'care-v1',
  lifecycle_state:lifecycleState,
  participation_count:Number(m.participation_count)||0,
  participation_rate:Number(m.participation_rate)||0,
  participation_streak:Number(m.participation_streak)||0,
  inactivity_streak:Number(m.inactivity_streak)||0,
  trend:Number(m.trend)||0,
  deviation:Number(m.deviation)||0,
  relationship_score:values.relationshipScore,
  observation_attention:Number(o.max_attention)||0,
  observation_severity:Number(o.max_severity)||0,
  active_memory_count:memoryCount,
  human_feedback_count:Number(f.total)||0,
  feedback_effect:values.feedback.effect,
  feedback_confidence:values.feedback.confidence
 };
 await db.query(`INSERT INTO people_intelligence(organization_id,person_id,lifecycle_state,engagement_score,churn_probability,attention_score,attention_level,next_best_action,action_reason,evidence,feature_snapshot,model_version,calculated_at,updated_at) VALUES($1,$2,$3,$4,0,$5,$6,$7,$8,$9,$10,'care-v1',NOW(),NOW()) ON CONFLICT(organization_id,person_id) DO UPDATE SET lifecycle_state=EXCLUDED.lifecycle_state,engagement_score=EXCLUDED.engagement_score,attention_score=EXCLUDED.attention_score,attention_level=EXCLUDED.attention_level,next_best_action=EXCLUDED.next_best_action,action_reason=EXCLUDED.action_reason,evidence=EXCLUDED.evidence,feature_snapshot=EXCLUDED.feature_snapshot,model_version=EXCLUDED.model_version,calculated_at=NOW(),updated_at=NOW()`,[
  orgId,personId,lifecycleState,values.engagementScore,values.attentionScore,values.attentionLevel,action.action,action.reason,JSON.stringify(evidence),JSON.stringify(evidence)
 ]);
 return{personId,organizationId:orgId,lifecycleState,engagementScore:values.engagementScore,relationshipScore:values.relationshipScore,attentionScore:values.attentionScore,attentionLevel:values.attentionLevel,nextBestAction:action.action,actionReason:action.reason,evidence};
                                                                                                      }
