// lib/aria/recommendationEngine.js
import pool from '../db';
import { recordOutcome } from './outcomeEngine';

const PRIORITY_ORDER={critical:4,high:3,medium:2,low:1};

function normalizePriority(priority){
  return Object.prototype.hasOwnProperty.call(PRIORITY_ORDER,priority)?priority:'medium';
}

function safeLimit(value,fallback=20){
  return Math.min(Math.max(Number(value)||fallback,1),100);
}

// Creates one idempotent proposed action from one observation.
export async function planActionFromObservation({
  organizationId,personId=null,observationId,actionType,
  priority='medium',actionMetadata={},actionKey=null
}){
  if(!organizationId)throw new Error('organizationId required');
  if(!observationId)throw new Error('observationId required');
  if(!actionType)throw new Error('actionType required');

  const normalizedPriority=normalizePriority(priority);
  const key=actionKey||`${organizationId}:${personId||'global'}:${actionType}:${observationId}`;

  const result=await pool.query(`
    INSERT INTO aria_actions(
      organization_id,person_id,observation_id,type,status,priority,
      action_metadata,action_key,proposed_at
    )
    VALUES($1,$2,$3,$4,'proposed',$5,$6,$7,NOW())
    ON CONFLICT(organization_id,action_key) DO NOTHING
    RETURNING id
  `,[organizationId,personId,observationId,actionType,normalizedPriority,actionMetadata,key]);

  return result.rows[0]?.id||null;
}

// Approval is organization-scoped and atomically limited to proposed actions.
export async function approveAction(actionId,organizationId,approvedByUserId){
  if(!actionId)throw new Error('actionId required');
  if(!organizationId)throw new Error('organizationId required');
  if(!approvedByUserId)throw new Error('approvedByUserId required');

  const result=await pool.query(`
    UPDATE aria_actions
    SET status='approved',approved_by=$1,approved_at=NOW(),updated_at=NOW()
    WHERE id=$2 AND organization_id=$3 AND status='proposed'
    RETURNING *
  `,[approvedByUserId,actionId,organizationId]);

  return result.rows[0]||null;
}

// Rejection/cancellation is organization-scoped.
export async function rejectAction(actionId,organizationId,reason=null){
  if(!actionId)throw new Error('actionId required');
  if(!organizationId)throw new Error('organizationId required');

  const result=await pool.query(`
    UPDATE aria_actions
    SET status='cancelled',failure_reason=$1,updated_at=NOW()
    WHERE id=$2 AND organization_id=$3 AND status IN('proposed','approved')
    RETURNING *
  `,[reason,actionId,organizationId]);

  return result.rows[0]||null;
}

// Executes only an approved action belonging to the caller's organization.
export async function executeAction(actionId,organizationId,executor=null){
  if(!actionId)throw new Error('actionId required');
  if(!organizationId)throw new Error('organizationId required');

  const client=await pool.connect();

  try{
    await client.query('BEGIN');

    const result=await client.query(`
      SELECT *
      FROM aria_actions
      WHERE id=$1 AND organization_id=$2 AND status='approved'
      FOR UPDATE
    `,[actionId,organizationId]);

    if(!result.rows.length)throw new Error('Action not found, unauthorized, or not approved');

    const action=result.rows[0];

    await client.query(`
      UPDATE aria_actions
      SET status='executing',updated_at=NOW()
      WHERE id=$1 AND organization_id=$2
    `,[actionId,organizationId]);

    let outcome;

    switch(action.type){
      case 'SEND_MESSAGE':
        // Messaging execution belongs to 5.6; never fake success here.
        outcome={success:false,deferred:true,message:'Messaging execution is not integrated yet.'};
        break;

      case 'REQUEST_REVIEW':
        outcome={success:true,message:'Review request created.'};
        break;

      case 'ESCALATE':
        outcome={success:true,message:'Escalation recorded.'};
        break;

      case 'MARK_ATTENDANCE':
        outcome={success:false,deferred:true,message:'Attendance execution is controlled by the attendance pipeline.'};
        break;

      case 'SCAN':
        outcome={success:false,deferred:true,message:'Scan execution is controlled by the scan pipeline.'};
        break;

      case 'DO_NOTHING':
        outcome={success:true,message:'No action taken.'};
        break;

      default:
        throw new Error(`Unsupported ARIA action type: ${action.type}`);
    }

    if(outcome.deferred){
      await client.query(`
        UPDATE aria_actions
        SET status='approved',outcome=$1,updated_at=NOW()
        WHERE id=$2 AND organization_id=$3
      `,[outcome,actionId,organizationId]);

      await client.query('COMMIT');
      return await getAction(actionId,organizationId);
    }

    await client.query(`
      UPDATE aria_actions
      SET status='executed',executed_at=NOW(),outcome=$1,updated_at=NOW()
      WHERE id=$2 AND organization_id=$3
    `,[outcome,actionId,organizationId]);

    await client.query('COMMIT');

    // Outcome recording is deliberately after the action transaction commits.
    if(action.person_id){
      try{
        await recordOutcome(
          organizationId,
          action.person_id,
          outcome.success?'SUCCESS':'FAILURE',
          outcome.score??null,
          action.id
        );
      }catch(outcomeErr){
        console.error('[ARIA] Outcome recording failed:',outcomeErr);
      }
    }

    if(action.person_id){
      const {updatePersonState}=await import('./stateManager');
      await updatePersonState(action.person_id,organizationId);
    }

    if(action.observation_id&&outcome.success){
      await pool.query(`
        UPDATE aria_observations
        SET status='resolved',resolved_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND organization_id=$2 AND status='active'
      `,[action.observation_id,organizationId]);
    }

    return await getAction(actionId,organizationId);
  }catch(err){
    try{await client.query('ROLLBACK');}catch(rollbackErr){
      console.error('[ARIA] Action rollback failed:',rollbackErr);
    }

    try{
      await pool.query(`
        UPDATE aria_actions
        SET status='failed',failure_reason=$1,updated_at=NOW()
        WHERE id=$2 AND organization_id=$3 AND status='executing'
      `,[err.message,actionId,organizationId]);
    }catch(failErr){
      console.error('[ARIA] Failed to persist action failure:',failErr);
    }

    throw err;
  }finally{
    client.release();
  }
}

async function getAction(actionId,organizationId){
  const result=await pool.query(`
    SELECT *
    FROM aria_actions
    WHERE id=$1 AND organization_id=$2
  `,[actionId,organizationId]);

  return result.rows[0]||null;
}

export async function getPendingActions(orgId,limit=20){
  if(!orgId)throw new Error('orgId required');

  const safeLimit=safeLimitValue(limit,20);
  const result=await pool.query(`
    SELECT
      a.*,p.first_name,p.last_name,p.phone,
      o.type AS observation_type,o.severity,o.urgency,
      o.attention_score,o.evidence
    FROM aria_actions a
    LEFT JOIN people p
      ON p.id=a.person_id AND p.organization_id=a.organization_id
    LEFT JOIN aria_observations o
      ON o.id=a.observation_id AND o.organization_id=a.organization_id
    WHERE a.organization_id=$1
      AND a.status IN('proposed','approved')
    ORDER BY
      CASE a.priority
        WHEN 'critical' THEN 4
        WHEN 'high' THEN 3
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 1
        ELSE 0
      END DESC,
      a.proposed_at ASC
    LIMIT $2
  `,[orgId,safeLimit]);

  return result.rows;
}

function safeLimitValue(value,fallback){
  return Math.min(Math.max(Number(value)||fallback,1),100);
}

export async function getActionsForPerson(personId,orgId,limit=20){
  if(!personId)throw new Error('personId required');
  if(!orgId)throw new Error('orgId required');

  const result=await pool.query(`
    SELECT *
    FROM aria_actions
    WHERE person_id=$1 AND organization_id=$2
    ORDER BY created_at DESC
    LIMIT $3
  `,[personId,orgId,safeLimitValue(limit,20)]);

  return result.rows;
}

// Converts active high-attention observations into idempotent proposed actions.
export async function generateActionsFromObservations(orgId){
  if(!orgId)throw new Error('orgId required');

  const observations=await pool.query(`
    SELECT id,person_id,type,attention_score,severity,urgency,evidence
    FROM aria_observations
    WHERE organization_id=$1 AND status='active' AND attention_score>50
    ORDER BY attention_score DESC,detected_at ASC
  `,[orgId]);

  const actionsCreated=[];

  for(const observation of observations.rows){
    let actionType,priority,metadata;

    switch(observation.type){
      case 'NEW_PERSON':
        actionType='SEND_MESSAGE';priority='medium';metadata={template:'welcome'};break;
      case 'ATTENDANCE_CHANGE':
        actionType='SEND_MESSAGE';
        priority=['high','critical'].includes(observation.severity)?'high':'medium';
        metadata={template:'check_in'};break;
      case 'UNUSUAL_ABSENCE':
        actionType='SEND_MESSAGE';
        priority=observation.severity==='critical'?'critical':'high';
        metadata={template:'concern'};break;
      case 'CARE_RISK':
        actionType='ESCALATE';
        priority=observation.severity==='critical'?'critical':'high';
        metadata={reason:'Care risk detected'};break;
      case 'POSSIBLE_DUPLICATE':
        actionType='REQUEST_REVIEW';priority='medium';metadata={type:'duplicate_review'};break;
      case 'LOW_ENGAGEMENT':
        actionType='SEND_MESSAGE';priority='medium';metadata={template:'reengage'};break;
      default:continue;
    }

    const actionId=await planActionFromObservation({
      organizationId:orgId,
      personId:observation.person_id,
      observationId:observation.id,
      actionType,priority,actionMetadata:metadata
    });

    if(actionId)actionsCreated.push({actionId,observationId:observation.id});
  }

  return actionsCreated;
}

// Backward-compatible API name used by pages/api/recommendations.js.
export async function getPendingRecommendations(orgId,limit=50){
  return getPendingActions(orgId,limit);
    }
