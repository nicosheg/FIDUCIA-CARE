// lib/aria/stateManager.js
import pool from '../db';

const RISK={low:1,medium:2,high:3,critical:4};
const LEVEL={0:'none',1:'low',2:'medium',3:'high',4:'critical'};

function riskLevel(v){return RISK[v]||0;}
function attentionLevel(v){return LEVEL[Math.max(0,Math.min(4,Number(v)||0))]||'none';}

function deriveRelationshipState(score){
  if(!score)return 'unknown';
  if(score>=80)return 'strong';
  if(score>=60)return 'healthy';
  if(score>=40)return 'developing';
  if(score>=20)return 'weak';
  return 'unknown';
}

export async function updatePersonState(personId,orgId,client=null){
  if(!personId||!orgId)throw new Error('personId and orgId are required');

  const db=client||pool;

  const person=await db.query(`
    SELECT id,status
    FROM people
    WHERE id=$1 AND organization_id=$2
    LIMIT 1
  `,[personId,orgId]);

  if(!person.rows.length)throw new Error(`Person ${personId} not found in organization ${orgId}`);

  const [metrics,relationship,observations,actions]=await Promise.all([
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
        COALESCE(MAX(attention_score),0)::float AS max_attention,
        COALESCE(MAX(
          CASE severity
            WHEN 'critical' THEN 4
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 1
            ELSE 0
          END
        ),0)::int AS max_severity
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
        AND status IN ('proposed','approved','queued')
    `,[orgId,personId])
  ]);

  const m=metrics.rows[0]||{};
  const r=relationship.rows[0]||{};
  const o=observations.rows[0]||{};
  const openActions=Number(actions.rows[0]?.count)||0;

  const inactivity=Number(m.inactivity_streak)||0;
  const trend=Number(m.trend)||0;
  const deviation=Number(m.deviation)||0;
  const observationRisk=Math.max(
    Number(o.max_severity)||0,
    Number(o.max_attention)>=75?4:
    Number(o.max_attention)>=50?3:
    Number(o.max_attention)>=25?2:
    Number(o.max_attention)>0?1:0
  );

  const engagementState=m.engagement_status||(
    inactivity>=8?'inactive':
    inactivity>=4?'at_risk':
    Number(m.participation_count)>=4?'regular':
    Number(m.participation_count)>1?'returning':
    Number(m.participation_count)===1?'first_time':
    'unknown'
  );

  const relationshipScore=Number(r.score)||0;
  const relationshipState=r.relationship_state||deriveRelationshipState(relationshipScore);

  const engagementRisk=
    inactivity>=8?4:
    inactivity>=4?3:
    inactivity>=2?2:
    trend<-.5||deviation<-.5?2:
    0;

  const risk=Math.max(engagementRisk,observationRisk);

  const careState=
    risk>=4?'urgent_action_required':
    risk>=3?'at_risk':
    risk>=2?'needs_attention':
    'active';

  const lastMeaningfulEvent=m.last_meaningful_event||m.last_seen||null;

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
      updated_at
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
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
      updated_at=NOW()
  `,[
    personId,
    orgId,
    engagementState,
    careState,
    relationshipState,
    'none',
    attentionLevel(risk),
    Number(o.count)||0,
    openActions,
    lastMeaningfulEvent
  ]);

  return{
    personId,
    organizationId:orgId,
    engagementState,
    careState,
    relationshipState,
    followupState:'none',
    attentionLevel:attentionLevel(risk),
    openObservationCount:Number(o.count)||0,
    openActionCount:openActions,
    lastMeaningfulEvent,
    engagement:{
      participationCount:Number(m.participation_count)||0,
      participationRate:Number(m.participation_rate)||0,
      participationStreak:Number(m.participation_streak)||0,
      inactivityStreak:inactivity,
      baselineFrequency:Number(m.baseline_frequency)||0,
      recentFrequency:Number(m.recent_frequency)||0,
      trend,
      deviation,
      confidence:Number(m.confidence)||0
    },
    relationship:{
      score:relationshipScore,
      state:relationshipState
    }
  };
    }
