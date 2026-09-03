// lib/aria/peopleIntelligence.js
import pool from '../db';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const level=s=>s>=80?'critical':s>=60?'high':s>=35?'medium':s>0?'low':'none';

function lifecycle(m,churn){
 const count=Number(m.participation_count)||0;
 const inactivity=Number(m.inactivity_streak)||0;
 if(!count)return 'new';
 if(inactivity>=8)return 'inactive';
 if(churn>=.6||inactivity>=4)return 'at_risk';
 if(count===1)return 'onboarding';
 if(inactivity===0&&count>=4)return 'engaged';
 if(inactivity<4)return 'returning';
 return 'inactive';
}

function feedbackEffect(f){
 const positive=Number(f.positive)||0;
 const negative=Number(f.negative)||0;
 const helpful=Number(f.helpful)||0;
 const ineffective=Number(f.ineffective)||0;
 const total=positive+negative+helpful+ineffective;
 if(!total)return {effect:0,confidence:0};
 return {effect:clamp((positive+helpful-negative-ineffective)/Math.max(1,total),-1,1),confidence:clamp(total/10,0,1)};
}

function calculate(m,o,r,f){
 const inactivity=Number(m.inactivity_streak)||0;
 const trend=Number(m.trend)||0;
 const deviation=Number(m.deviation)||0;
 const rate=Number(m.participation_rate)||0;
 const relationship=Number(r.score)||0;
 const observationAttention=Number(o.max_attention)||0;
 const severity=Number(o.max_severity)||0;
 const feedback=feedbackEffect(f);

 let churn=.05;
 churn+=Math.min(.55,inactivity*.07);
 if(trend<0)churn+=Math.min(.18,Math.abs(trend)*.18);
 if(deviation<0)churn+=Math.min(.12,Math.abs(deviation)*.12);
 if(rate<25)churn+=.08;
 if(relationship>0&&relationship<40)churn+=.08;
 if(severity>=3)churn+=.05;
 churn-=Math.max(0,feedback.effect)*.08;
 churn+=Math.max(0,-feedback.effect)*.08;
 churn=clamp(churn,0,1);

 let engagement=50;
 engagement+=rate*.35;
 engagement+=Math.max(0,trend)*15;
 engagement+=Math.max(0,relationship-50)*.2;
 engagement-=inactivity*5;
 engagement-=Math.max(0,-trend)*20;
 engagement-=Math.max(0,-deviation)*15;
 engagement+=feedback.effect*10;
 engagement=clamp(Math.round(engagement),0,100);

 let attention=churn*70;
 attention+=severity*8;
 attention+=observationAttention*.3;
 attention+=Math.max(0,-trend)*15;
 attention+=Math.max(0,-deviation)*10;
 attention+=inactivity*3;
 attention+=Math.max(0,-feedback.effect)*8;
 attention=clamp(attention,0,100);

 return{churnProbability:Number(churn.toFixed(4)),engagementScore:engagement,attentionScore:Number(attention.toFixed(3)),attentionLevel:level(attention),feedback};
}

function actionFor({lifecycleState,churnProbability,attentionLevel,inactivityStreak,participationCount,feedback}){
 if(attentionLevel==='critical')return{action:'human_intervention',reason:'ARIA found a strong attention signal and recommends human review.'};
 if(lifecycleState==='new')return{action:'welcome_and_onboard',reason:'This person is newly known and ARIA recommends beginning the relationship intentionally.'};
 if(lifecycleState==='onboarding')return{action:'continue_onboarding',reason:'This relationship is still forming and a thoughtful follow-up may help the person feel connected.'};
 if(lifecycleState==='at_risk'||churnProbability>=.6)return{action:'personal_follow_up',reason:`ARIA sees elevated disengagement risk after ${inactivityStreak} quiet week(s).`};
 if(inactivityStreak>=2)return{action:'check_in',reason:`ARIA has noticed ${inactivityStreak} quiet week(s) and suggests a human check-in.`};
 if(feedback.effect<-.25)return{action:'adjust_care_approach',reason:'Recent human feedback suggests the previous approach may not have worked well.'};
 if(participationCount>=4)return{action:'strengthen_relationship',reason:'This person is consistently connected. ARIA recommends caring proactively rather than waiting for a problem.'};
 return{action:'thoughtful_check_in',reason:'There is no major risk signal. ARIA recommends an occasional human touch so care is not reserved only for difficult moments.'};
}

export async function updatePeopleIntelligence(personId,orgId,client=null){
 if(!personId||!orgId)throw new Error('personId and orgId are required');
 const db=client||pool;

 const [person,metrics,observations,relationship,feedback]=await Promise.all([
  db.query(`SELECT id,status FROM people WHERE id=$1 AND organization_id=$2 LIMIT 1`,[personId,orgId]),
  db.query(`SELECT * FROM engagement_metrics WHERE organization_id=$1 AND person_id=$2 LIMIT 1`,[orgId,personId]),
  db.query(`SELECT COALESCE(MAX(attention_score),0)::float AS max_attention,COALESCE(MAX(CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END),0)::int AS max_severity FROM aria_observations WHERE organization_id=$1 AND person_id=$2 AND status='active' AND (expires_at IS NULL OR expires_at>NOW())`,[orgId,personId]),
  db.query(`SELECT score,relationship_state FROM relationship_scores WHERE organization_id=$1 AND person_id=$2 ORDER BY calculated_at DESC LIMIT 1`,[orgId,personId]),
  db.query(`SELECT COUNT(*) FILTER(WHERE feedback_type IN('positive','helpful','worked','relationship_strengthened'))::int AS positive,COUNT(*) FILTER(WHERE feedback_type IN('negative','ineffective','did_not_work'))::int AS negative,COUNT(*) FILTER(WHERE feedback_type='helpful')::int AS helpful,COUNT(*) FILTER(WHERE feedback_type IN('ineffective','did_not_work'))::int AS ineffective,COUNT(*)::int AS total FROM care_feedback WHERE organization_id=$1 AND person_id=$2 AND observed_at>=NOW()-INTERVAL '180 days'`,[orgId,personId])
 ]);

 if(!person.rows.length)throw new Error('Person not found');

 const m=metrics.rows[0]||{};
 const o=observations.rows[0]||{};
 const r=relationship.rows[0]||{};
 const f=feedback.rows[0]||{};
 const values=calculate(m,o,r,f);
 const lifecycleState=lifecycle(m,values.churnProbability);
 const action=actionFor({lifecycleState,churnProbability:values.churnProbability,attentionLevel:values.attentionLevel,inactivityStreak:Number(m.inactivity_streak)||0,participationCount:Number(m.participation_count)||0,feedback:values.feedback});

 const evidence={
  model:'phase1-v2',
  lifecycle_state:lifecycleState,
  participation_count:Number(m.participation_count)||0,
  participation_rate:Number(m.participation_rate)||0,
  participation_streak:Number(m.participation_streak)||0,
  inactivity_streak:Number(m.inactivity_streak)||0,
  trend:Number(m.trend)||0,
  deviation:Number(m.deviation)||0,
  relationship_score:Number(r.score)||0,
  observation_attention:Number(o.max_attention)||0,
  observation_severity:Number(o.max_severity)||0,
  human_feedback_count:Number(f.total)||0,
  feedback_effect:values.feedback.effect,
  feedback_confidence:values.feedback.confidence
 };

 await db.query(`INSERT INTO people_intelligence(organization_id,person_id,lifecycle_state,engagement_score,churn_probability,attention_score,attention_level,next_best_action,action_reason,evidence,feature_snapshot,model_version,calculated_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'phase1-v2',NOW(),NOW()) ON CONFLICT(organization_id,person_id) DO UPDATE SET lifecycle_state=EXCLUDED.lifecycle_state,engagement_score=EXCLUDED.engagement_score,churn_probability=EXCLUDED.churn_probability,attention_score=EXCLUDED.attention_score,attention_level=EXCLUDED.attention_level,next_best_action=EXCLUDED.next_best_action,action_reason=EXCLUDED.action_reason,evidence=EXCLUDED.evidence,feature_snapshot=EXCLUDED.feature_snapshot,model_version=EXCLUDED.model_version,calculated_at=NOW(),updated_at=NOW()`,[
  orgId,personId,lifecycleState,values.engagementScore,values.churnProbability,values.attentionScore,values.attentionLevel,action.action,action.reason,JSON.stringify(evidence),JSON.stringify({...evidence})
 ]);

 return{personId,organizationId:orgId,lifecycleState,engagementScore:values.engagementScore,churnProbability:values.churnProbability,attentionScore:values.attentionScore,attentionLevel:values.attentionLevel,nextBestAction:action.action,actionReason:action.reason,evidence};
}
