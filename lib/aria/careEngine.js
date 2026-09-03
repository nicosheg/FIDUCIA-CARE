// lib/aria/careEngine.js
import pool from '../db';
import { planActionFromObservation } from './recommendationEngine';

const ACTIONS={
 welcome_and_onboard:{type:'SEND_MESSAGE',priority:'medium',template:'welcome'},
 continue_onboarding:{type:'SEND_MESSAGE',priority:'medium',template:'onboarding'},
 personal_follow_up:{type:'SEND_MESSAGE',priority:'high',template:'personal_follow_up'},
 check_in:{type:'SEND_MESSAGE',priority:'medium',template:'check_in'},
 thoughtful_check_in:{type:'SEND_MESSAGE',priority:'low',template:'thoughtful_check_in'},
 strengthen_relationship:{type:'SEND_MESSAGE',priority:'low',template:'strengthen_relationship'},
 adjust_care_approach:{type:'SEND_MESSAGE',priority:'medium',template:'adjust_approach'},
 human_intervention:{type:'ESCALATE',priority:'critical',template:null}
};

function priorityFor(level){
 if(level==='critical')return'critical';
 if(level==='high')return'high';
 if(level==='medium')return'medium';
 return'low';
}

function fingerprint(row){
 const m=row.feature_snapshot&&typeof row.feature_snapshot==='object'?row.feature_snapshot:{};
 return[
  row.lifecycle_state||'new',
  row.next_best_action||'observe',
  Number(row.inactivity_streak)||0,
  Number(row.participation_streak)||0,
  Number(row.attention_score)||0,
  Number(row.engagement_score)||0,
  Number(row.churn_probability)||0,
  row.last_meaningful_event||''
 ].join('|');
}

export async function generateCareRecommendations(orgId){
 if(!orgId)throw new Error('orgId required');

 const result=await pool.query(`
  SELECT
   p.id AS person_id,
   p.first_name,
   p.last_name,
   p.display_name,
   p.phone,
   p.email,
   pi.lifecycle_state,
   pi.engagement_score,
   pi.churn_probability,
   pi.attention_score,
   pi.attention_level,
   pi.next_best_action,
   pi.action_reason,
   pi.evidence,
   pi.feature_snapshot,
   pi.updated_at AS intelligence_updated_at,
   ps.care_state,
   ps.followup_state,
   ps.attention_level AS state_attention_level,
   ps.last_meaningful_event,
   ps.open_action_count,
   em.inactivity_streak,
   em.participation_streak,
   em.participation_count,
   em.last_seen,
   ao.id AS observation_id,
   ao.type AS observation_type,
   ao.attention_score AS observation_attention,
   ao.severity AS observation_severity,
   ao.urgency AS observation_urgency
  FROM people p
  JOIN people_intelligence pi
    ON pi.person_id=p.id
   AND pi.organization_id=p.organization_id
  LEFT JOIN aria_person_state ps
    ON ps.person_id=p.id
   AND ps.organization_id=p.organization_id
  LEFT JOIN engagement_metrics em
    ON em.person_id=p.id
   AND em.organization_id=p.organization_id
  LEFT JOIN LATERAL(
   SELECT id,type,attention_score,severity,urgency
   FROM aria_observations
   WHERE organization_id=p.organization_id
     AND person_id=p.id
     AND status='active'
     AND(expires_at IS NULL OR expires_at>NOW())
   ORDER BY attention_score DESC,detected_at DESC
   LIMIT 1
  ) ao ON true
  WHERE p.organization_id=$1
    AND COALESCE(p.status,'active')='active'
    AND COALESCE(pi.next_best_action,'observe') NOT IN('observe','none','DO_NOTHING')
  ORDER BY
   CASE COALESCE(pi.attention_level,ps.attention_level)
    WHEN'critical'then 4
    WHEN'high'then 3
    WHEN'medium'then 2
    WHEN'low'then 1
    ELSE 0
   END DESC,
   pi.attention_score DESC,
   pi.updated_at DESC
 `,[orgId]);

 const created=[];
 for(const row of result.rows){
  const action=ACTIONS[row.next_best_action];
  if(!action)continue;

  const existing=await pool.query(`
   SELECT id
   FROM aria_actions
   WHERE organization_id=$1
     AND person_id=$2
     AND type=$3
     AND status IN('proposed','approved','executing')
   LIMIT 1
  `,[orgId,row.person_id,action.type]);

  if(existing.rows.length)continue;

  const evidence={
   source:'people_intelligence',
   lifecycle_state:row.lifecycle_state,
   engagement_score:Number(row.engagement_score)||0,
   churn_probability:Number(row.churn_probability)||0,
   attention_score:Number(row.attention_score)||0,
   attention_level:row.attention_level||row.state_attention_level||'none',
   action_reason:row.action_reason||null,
   inactivity_streak:Number(row.inactivity_streak)||0,
   participation_streak:Number(row.participation_streak)||0,
   participation_count:Number(row.participation_count)||0,
   last_seen:row.last_seen||null,
   last_meaningful_event:row.last_meaningful_event||null,
   observation_type:row.observation_type||null,
   observation_attention:Number(row.observation_attention)||0,
   observation_severity:row.observation_severity||null,
   observation_urgency:row.observation_urgency||null
  };

  const key=`care:${orgId}:${row.person_id}:${action.type}:${fingerprint(row)}`;

  const actionId=await planActionFromObservation({
   organizationId:orgId,
   personId:row.person_id,
   observationId:row.observation_id||null,
   actionType:action.type,
   priority:priorityFor(row.attention_level||row.state_attention_level),
   actionMetadata:{
    kind:'care_recommendation',
    template:action.template,
    reason:row.action_reason||'ARIA identified an opportunity for intentional human care.',
    evidence,
    requires_human_approval:true,
    draft_required:action.type==='SEND_MESSAGE',
    channel:action.type==='SEND_MESSAGE'?'whatsapp':null
   },
   actionKey:key
  });

  if(actionId)created.push({
   actionId,
   personId:row.person_id,
   actionType:action.type,
   priority:priorityFor(row.attention_level||row.state_attention_level),
   reason:row.action_reason||null
  });
 }

 return created;
}

export async function getCareOpportunities(orgId,limit=50){
 if(!orgId)throw new Error('orgId required');
 const safeLimit=Math.min(Math.max(Number(limit)||50,1),100);
 const result=await pool.query(`
  SELECT
   ps.*,
   p.first_name,
   p.last_name,
   p.display_name,
   p.phone,
   p.email,
   pi.next_best_action,
   pi.action_reason,
   pi.evidence
  FROM aria_person_state ps
  JOIN people p
    ON p.id=ps.person_id
   AND p.organization_id=ps.organization_id
  LEFT JOIN people_intelligence pi
    ON pi.person_id=ps.person_id
   AND pi.organization_id=ps.organization_id
  WHERE ps.organization_id=$1
    AND ps.followup_state='recommended'
    AND COALESCE(p.status,'active')='active'
  ORDER BY
   CASE ps.attention_level
    WHEN'critical'then 4
    WHEN'high'then 3
    WHEN'medium'then 2
    WHEN'low'then 1
    ELSE 0
   END DESC,
   ps.updated_at DESC
  LIMIT $2
 `,[orgId,safeLimit]);
 return result.rows;
}
