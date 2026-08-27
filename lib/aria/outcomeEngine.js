// lib/aria/outcomeEngine.js
import pool from '../db';

export async function recordOutcome(orgId,personId,outcomeType,outcomeScore=null,actionId=null){
  if(!orgId)throw new Error('orgId required');
  if(!personId)throw new Error('personId required');
  if(!outcomeType)throw new Error('outcomeType required');

  if(outcomeScore!==null){
    const score=Number(outcomeScore);
    if(!Number.isFinite(score))throw new Error('outcomeScore must be finite');
  }

  if(actionId){
    const action=await pool.query(`
      SELECT id
      FROM aria_actions
      WHERE id=$1 AND organization_id=$2 AND person_id=$3
      LIMIT 1
    `,[actionId,orgId,personId]);

    if(!action.rows.length)throw new Error('Action does not belong to the organization/person');
  }

  const result=await pool.query(`
    INSERT INTO engagement_outcomes(
      organization_id,person_id,action_id,outcome_type,outcome_score
    )
    VALUES($1,$2,$3,$4,$5)
    RETURNING *
  `,[orgId,personId,actionId,outcomeType,outcomeScore]);

  return result.rows[0];
}

export async function getOutcomesForPerson(orgId,personId){
  if(!orgId)throw new Error('orgId required');
  if(!personId)throw new Error('personId required');

  const result=await pool.query(`
    SELECT *
    FROM engagement_outcomes
    WHERE organization_id=$1 AND person_id=$2
    ORDER BY created_at DESC
  `,[orgId,personId]);

  return result.rows;
}

export async function getOutcomeStats(orgId){
  if(!orgId)throw new Error('orgId required');

  const result=await pool.query(`
    SELECT outcome_type,COUNT(*)::int AS count
    FROM engagement_outcomes
    WHERE organization_id=$1
    GROUP BY outcome_type
    ORDER BY count DESC
  `,[orgId]);

  return result.rows;
    }
