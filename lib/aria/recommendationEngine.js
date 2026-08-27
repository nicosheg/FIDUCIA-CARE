// lib/aria/recommendationEngine.js
import pool from '../db';

const PRIORITY_ORDER={critical:4,high:3,medium:2,low:1};

function normalizePriority(priority){
  return PRIORITY_ORDER[priority] ? priority : 'medium';
}

function safeLimit(value,fallback=20){
  return Math.min(Math.max(Number(value)||fallback,1),100);
}

export async function planActionFromObservation({
  organizationId,
  personId=null,
  observationId,
  actionType,
  priority='medium',
  actionMetadata={},
  actionKey=null
}){
  if(!organizationId) throw new Error('organizationId required');
  if(!observationId) throw new Error('observationId required');
  if(!actionType) throw new Error('actionType required');

  const db=pool;
  const key=actionKey||`${personId||'global'}:${actionType}:${observationId}`;

  const observation=await db.query(`
    SELECT id,person_id
    FROM aria_observations
    WHERE id=$1 AND organization_id=$2
    LIMIT 1
  `,[observationId,organizationId]);

  if(!observation.rows.length) throw new Error('Observation not found in organization');

  const resolvedPersonId=personId||observation.rows[0].person_id;

  if(
    personId &&
    observation.rows[0].person_id &&
    observation.rows[0].person_id!==personId
  ){
    throw new Error('Observation does not belong to person');
  }

  if(resolvedPersonId){
    const person=await db.query(`
      SELECT id
      FROM people
      WHERE id=$1 AND organization_id=$2
      LIMIT 1
    `,[resolvedPersonId,organizationId]);

    if(!person.rows.length) throw new Error('Person not found in organization');
  }

  const result=await db.query(`
    INSERT INTO aria_actions(
      organization_id,
      person_id,
      observation_id,
      type,
      status,
      priority,
      action_metadata,
      action_key,
      proposed_at
    )
    VALUES($1,$2,$3,$4,'proposed',$5,$6,$7,NOW())
    ON CONFLICT(organization_id,action_key) DO NOTHING
    RETURNING *
  `,[
    organizationId,
    resolvedPersonId,
    observationId,
    actionType,
    normalizePriority(priority),
    actionMetadata||{},
    key
  ]);

  return result.rows[0]||null;
}

export async function generateActionsFromObservations(orgId){
  if(!orgId) throw new Error('orgId required');

  const observations=await pool.query(`
    SELECT
      id,
      person_id,
      type,
      attention_score,
      severity,
      urgency,
      evidence
    FROM aria_observations
    WHERE organization_id=$1
      AND status='active'
      AND attention_score>50
      AND(
        expires_at IS NULL
        OR expires_at>NOW()
      )
    ORDER BY attention_score DESC,detected_at ASC
  `,[orgId]);

  const actionsCreated=[];

  for(const observation of observations.rows){
    let actionType;
    let priority;
    let metadata={};

    switch(observation.type){
      case 'NEW_PERSON':
        actionType='SEND_MESSAGE';
        priority='medium';
        metadata={template:'welcome'};
        break;

      case 'ATTENDANCE_CHANGE':
        actionType='SEND_MESSAGE';
        priority=['high','critical'].includes(observation.severity)?'high':'medium';
        metadata={template:'check_in'};
        break;

      case 'UNUSUAL_ABSENCE':
        actionType='SEND_MESSAGE';
        priority=observation.severity==='critical'?'critical':'high';
        metadata={template:'concern'};
        break;

      case 'CARE_RISK':
        actionType='ESCALATE';
        priority=observation.severity==='critical'?'critical':'high';
        metadata={reason:'Care risk detected'};
        break;

      case 'POSSIBLE_DUPLICATE':
        actionType='REQUEST_REVIEW';
        priority='medium';
        metadata={type:'duplicate_review'};
        break;

      case 'LOW_ENGAGEMENT':
        actionType='SEND_MESSAGE';
        priority='medium';
        metadata={template:'reengage'};
        break;

      default:
        continue;
    }

    const action=await planActionFromObservation({
      organizationId:orgId,
      personId:observation.person_id,
      observationId:observation.id,
      actionType,
      priority,
      actionMetadata:metadata
    });

    if(action){
      actionsCreated.push({
        actionId:action.id,
        observationId:observation.id
      });
    }
  }

  return actionsCreated;
}

/*
 * Approval/execution are retained here only for compatibility.
 * 5.5 should move their orchestration into the approval/execution layer.
 */

export async function approveAction(actionId,approvedByUserId,orgId=null){
  if(!actionId) throw new Error('actionId required');
  if(!approvedByUserId) throw new Error('approvedByUserId required');

  const result=await pool.query(`
    UPDATE aria_actions a
    SET
      status='approved',
      approved_by=$1,
      approved_at=NOW(),
      updated_at=NOW()
    FROM users u
    WHERE a.id=$2
      AND u.id=$1
      AND a.status='proposed'
      AND u.organization_id=a.organization_id
      AND($3::text IS NULL OR a.organization_id=$3)
    RETURNING a.*
  `,[approvedByUserId,actionId,orgId]);

  return result.rows[0]||null;
}

export async function rejectAction(actionId,reason=null,orgId=null){
  if(!actionId) throw new Error('actionId required');

  const result=await pool.query(`
    UPDATE aria_actions
    SET
      status='cancelled',
      failure_reason=$1,
      updated_at=NOW()
    WHERE id=$2
      AND status IN('proposed','approved')
      AND($3::text IS NULL OR organization_id=$3)
    RETURNING *
  `,[reason,actionId,orgId]);

  return result.rows[0]||null;
}

export async function executeAction(actionId,executor,orgId=null){
  if(!actionId) throw new Error('actionId required');
  if(typeof executor!=='function') throw new Error('executor required');

  const client=await pool.connect();

  try{
    await client.query('BEGIN');

    const actionRes=await client.query(`
      SELECT *
      FROM aria_actions
      WHERE id=$1
        AND status='approved'
        AND($2::text IS NULL OR organization_id=$2)
      FOR UPDATE
    `,[actionId,orgId]);

    if(!actionRes.rows.length){
      throw new Error('Action not found or not approved');
    }

    const action=actionRes.rows[0];

    await client.query(`
      UPDATE aria_actions
      SET status='executing',updated_at=NOW()
      WHERE id=$1 AND status='approved'
    `,[actionId]);

    let outcome;

    try{
      outcome=await executor(action);
      if(!outcome||typeof outcome!=='object'){
        throw new Error('Executor returned invalid outcome');
      }

      if(outcome.deferred){
        await client.query(`
          UPDATE aria_actions
          SET
            status='approved',
            outcome=$1,
            updated_at=NOW()
          WHERE id=$2
        `,[outcome,actionId]);

        await client.query('COMMIT');
        return getAction(actionId,orgId);
      }

      if(outcome.success===true){
        await client.query(`
          UPDATE aria_actions
          SET
            status='executed',
            executed_at=NOW(),
            outcome=$1,
            updated_at=NOW()
          WHERE id=$2
        `,[outcome,actionId]);

        if(action.observation_id){
          await client.query(`
            UPDATE aria_observations
            SET
              status='resolved',
              resolved_at=NOW(),
              updated_at=NOW()
            WHERE id=$1
              AND organization_id=$2
              AND status='active'
          `,[action.observation_id,action.organization_id]);
        }
      }else{
        await client.query(`
          UPDATE aria_actions
          SET
            status='failed',
            outcome=$1,
            failure_reason=$2,
            updated_at=NOW()
          WHERE id=$3
        `,[
          outcome,
          outcome.message||'Action execution failed',
          actionId
        ]);
      }

      await client.query('COMMIT');
      return getAction(actionId,orgId);
    }catch(err){
      await client.query(`
        UPDATE aria_actions
        SET
          status='failed',
          failure_reason=$1,
          updated_at=NOW()
        WHERE id=$2
      `,[err.message,actionId]);

      await client.query('COMMIT');
      throw err;
    }
  }catch(err){
    try{await client.query('ROLLBACK')}catch{}
    throw err;
  }finally{
    client.release();
  }
}

async function getAction(actionId,orgId=null){
  const result=await pool.query(`
    SELECT *
    FROM aria_actions
    WHERE id=$1
      AND($2::text IS NULL OR organization_id=$2)
    LIMIT 1
  `,[actionId,orgId]);

  return result.rows[0]||null;
}

export async function getPendingActions(orgId,limit=20){
  if(!orgId) throw new Error('orgId required');

  const safeLimit=safeLimitValue(limit);

  const result=await pool.query(`
    SELECT
      a.*,
      p.first_name,
      p.last_name,
      p.phone,
      o.type AS observation_type,
      o.severity,
      o.urgency,
      o.attention_score,
      o.evidence
    FROM aria_actions a
    LEFT JOIN people p
      ON p.id=a.person_id
     AND p.organization_id=a.organization_id
    LEFT JOIN aria_observations o
      ON o.id=a.observation_id
     AND o.organization_id=a.organization_id
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

function safeLimitValue(value){
  return Math.min(Math.max(Number(value)||20,1),100);
}

export async function getActionsForPerson(personId,orgId,limit=20){
  if(!personId) throw new Error('personId required');
  if(!orgId) throw new Error('orgId required');

  const result=await pool.query(`
    SELECT *
    FROM aria_actions
    WHERE person_id=$1
      AND organization_id=$2
    ORDER BY created_at DESC
    LIMIT $3
  `,[personId,orgId,safeLimitValue(limit)]);

  return result.rows;
}
