// lib/aria/learningEngine.js
import pool from'../db';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

export async function recordLearning({organizationId,personId=null,learningType,learningKey,value={},confidence=.5,sourceType='human_feedback',sourceId=null}){
 if(!organizationId||!learningType||!learningKey)throw new Error('organizationId, learningType and learningKey are required');
 const scopeKey=personId||'organization';
 const safeConfidence=clamp(Number(confidence)||0,0,1);
 const result=await pool.query(`INSERT INTO aria_learning(organization_id,person_id,scope_key,learning_type,learning_key,value,confidence,source_type,source_id,active,created_at,updated_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,NOW(),NOW()) ON CONFLICT(organization_id,scope_key,learning_type,learning_key) DO UPDATE SET value=EXCLUDED.value,confidence=GREATEST(aria_learning.confidence,EXCLUDED.confidence),source_type=EXCLUDED.source_type,source_id=EXCLUDED.source_id,active=true,updated_at=NOW() RETURNING *`,[organizationId,personId,scopeKey,learningType,learningKey,value,safeConfidence,sourceType,sourceId]);
 return result.rows[0];
}

export async function learnFromFeedback({organizationId,personId,feedbackId,actionId,feedbackType,sentiment,context={}}){
 const positive=['positive','successful','helpful','worked','relationship_strengthened'].includes(feedbackType);
 const negative=['negative','unsuccessful','ineffective','did_not_work','wrong_approach','wrong_timing','timing_wrong'].includes(feedbackType);
 const confidence=positive||negative?.8:.5;
 await recordLearning({organizationId,personId,learningType:'care_response',learningKey:'latest_feedback',value:{feedback_type:feedbackType,sentiment,context,action_id:actionId},confidence,sourceType:'human_feedback',sourceId:feedbackId});
 await recordLearning({organizationId,personId:null,learningType:'organization_pattern',learningKey:`feedback:${feedbackType}`,value:{feedback_type:feedbackType,sentiment,context,person_id:personId},confidence:.5,sourceType:'human_feedback',sourceId:feedbackId});
 if(positive||negative)await recordLearning({organizationId,personId:null,learningType:'voice_signal',learningKey:positive?'positive_response':'negative_response',value:{feedback_type:feedbackType,sentiment},confidence:.6,sourceType:'human_feedback',sourceId:feedbackId});
 return true;
}

export async function learnFromOutcome({organizationId,personId,actionId,outcome,outcomeScore,evidence={}}){
 const score=outcomeScore===null||outcomeScore===undefined?null:Number(outcomeScore);
 const confidence=score===null?.5:.5+Math.abs(score-.5);
 return recordLearning({organizationId,personId:null,learningType:'action_outcome',learningKey:String(outcome),value:{action_id:actionId,person_id:personId,outcome,outcome_score:score,evidence},confidence:clamp(confidence,0,1),sourceType:'outcome',sourceId:actionId});
}

export async function getLearnings(organizationId,{personId=null,learningType=null,limit=50}={}){
 if(!organizationId)throw new Error('organizationId required');
 const safeLimit=Math.min(Math.max(Number(limit)||50,1),200);
 const params=[organizationId];
 let where='organization_id=$1 AND active=true';
 if(personId){params.push(personId);where+=` AND(person_id=$${params.length} OR person_id IS NULL)`}
 if(learningType){params.push(learningType);where+=` AND learning_type=$${params.length}`}
 params.push(safeLimit);
 const result=await pool.query(`SELECT * FROM aria_learning WHERE ${where} ORDER BY confidence DESC,updated_at DESC LIMIT $${params.length}`,params);
 return result.rows;
  }
