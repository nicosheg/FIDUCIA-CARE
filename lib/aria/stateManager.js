// lib/aria/stateManager.js
import pool from '../db';

const ATTENTION_LEVEL={4:'critical',3:'high',2:'medium',1:'low',0:'none'};

function attentionFromScore(score){
  if(!Number.isFinite(Number(score))) return 'none';
  const normalized=Math.max(0,Math.min(4,Math.round(Number(score))));
  return ATTENTION_LEVEL[normalized]||'none';
}

function observationRisk(score){
  const attention=Number(score)||0;
  if(attention>=75) return 4;
  if(attention>=50) return 3;
  if(attention>=25) return 2;
  if(attention>0) return 1;
  return 0;
}

function deriveRelationshipState(events){
  if(events.firstTime) return 'new';
  if(events.returning) return 'returning';
  if(events.regular) return 'regular';
  return 'unknown';
}

function deriveEngagementState(events){
  if(events.inactive) return 'inactive';
  if(events.atRisk) return 'at_risk';
  if(events.regular) return 'active';
  if(events.returning) return 'returning';
  if(events.firstTime) return 'first_time';
  return 'unknown';
}

function deriveCareState(riskLevel){
  switch(riskLevel){
    case 4:return 'urgent_action_required';
    case 3:return 'at_risk';
    case 2:return 'needs_attention';
    case 1:return 'active';
    default:return 'none';
  }
}

export async function updatePersonState(personId,orgId,client=null){
  if(!personId) throw new Error('personId is required');
  if(!orgId) throw new Error('orgId is required');

  const db=client||pool;

  // Verify the person belongs to the organization before calculating state.
  const personRes=await db.query(
    `SELECT id,status,organization_id
     FROM people
     WHERE id=$1 AND organization_id=$2
     LIMIT 1`,
    [personId,orgId]
  );

  if(personRes.rows.length===0){
    throw new Error(`Person ${personId} not found in organization ${orgId}`);
  }

  // Only events belonging to this person + organization participate in state calculation.
  const eventsRes=await db.query(
    `SELECT type,metadata,occurred_at
     FROM aria_events
     WHERE person_id=$1 AND organization_id=$2
     ORDER BY occurred_at DESC`,
    [personId,orgId]
  );

  // Active, non-expired observations determine current observation risk/count.
  const observationsRes=await db.query(
    `SELECT
       COUNT(*)::int AS count,
       COALESCE(MAX(attention_score),0)::int AS max_attention,
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
     WHERE person_id=$1
       AND organization_id=$2
       AND status='active'
       AND (expires_at IS NULL OR expires_at>NOW())`,
    [personId,orgId]
  );

  // Proposed/approved/queued actions remain open until their status changes.
  const actionsRes=await db.query(
    `SELECT COUNT(*)::int AS count
     FROM aria_actions
     WHERE person_id=$1
       AND organization_id=$2
       AND status IN ('proposed','approved','queued')`,
    [personId,orgId]
  );

  const events={
    firstTime:false,
    returning:false,
    regular:false,
    inactive:false,
    atRisk:false
  };

  for(const event of eventsRes.rows){
    switch(event.type){
      case 'PERSON_CREATED':events.firstTime=true;break;
      case 'PERSON_RETURNED':events.returning=true;break;
      case 'PERSON_REGULAR':events.regular=true;break;
      case 'PERSON_INACTIVE':events.inactive=true;break;
      case 'PERSON_AT_RISK':events.atRisk=true;break;
      default:break;
    }
  }

  const observationStats=observationsRes.rows[0]||{
    count:0,
    max_attention:0,
    max_severity:0
  };

  const actionCount=Number(actionsRes.rows[0]?.count)||0;

  const observationRiskLevel=observationRisk(observationStats.max_attention);
  const severityRiskLevel=Number(observationStats.max_severity)||0;

  const highestRisk=Math.max(
    observationRiskLevel,
    severityRiskLevel,
    events.atRisk?3:0,
    events.inactive?2:0
  );

  const engagementState=deriveEngagementState(events);
  const relationshipState=deriveRelationshipState(events);
  const careState=deriveCareState(highestRisk);
  const attentionLevel=attentionFromScore(highestRisk);
  const lastMeaningfulEvent=eventsRes.rows[0]?.occurred_at||null;

  // FROZEN DB CONTRACT:
  // aria_person_state primary key = (organization_id, person_id).
  // Therefore the upsert conflict target MUST use both columns.
  await db.query(
    `INSERT INTO aria_person_state(
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
       updated_at=NOW()`,
    [
      personId,
      orgId,
      engagementState,
      careState,
      relationshipState,
      'none',
      attentionLevel,
      Number(observationStats.count)||0,
      actionCount,
      lastMeaningfulEvent
    ]
  );

  return{
    personId,
    organizationId:orgId,
    engagementState,
    careState,
    relationshipState,
    followupState:'none',
    attentionLevel,
    openObservationCount:Number(observationStats.count)||0,
    openActionCount:actionCount,
    lastMeaningfulEvent
  };
    }
