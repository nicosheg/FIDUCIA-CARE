// lib/aria/feedbackEngine.js
import pool from '../db';
import{updatePeopleIntelligence}from'./peopleIntelligence';
import{updatePersonState}from'./stateManager';
import{learnFromFeedback}from'./learningEngine';

const TYPES=['positive','negative','neutral','no_response','successful','unsuccessful','helpful','ineffective','worked','did_not_work','needs_follow_up','wrong_approach','wrong_timing','relationship_strengthened','new_information','timing_wrong','other'];
const SENTIMENTS=['positive','negative','neutral','mixed'];

const clean=(v,max=3000)=>String(v??'').trim().slice(0,max);

export async function recordCareFeedback({organizationId,personId,feedbackType,sentiment='neutral',note='',actionId=null,actorId=null,context={}}){
 if(!organizationId)throw new Error('organizationId required');
 if(!personId)throw new Error('personId required');
 if(!TYPES.includes(feedbackType))throw new Error('Invalid feedback type');
 if(!SENTIMENTS.includes(sentiment))throw new Error('Invalid sentiment');

 const person=await pool.query(`SELECT id FROM people WHERE id=$1 AND organization_id=$2 AND COALESCE(status,'active')='active' LIMIT 1`,[personId,organizationId]);
 if(!person.rows.length)throw Object.assign(new Error('Person not found'),{status:404});

 if(actionId){
  const action=await pool.query(`SELECT id FROM aria_actions WHERE id=$1 AND organization_id=$2 AND person_id=$3 LIMIT 1`,[actionId,organizationId,personId]);
  if(!action.rows.length)throw Object.assign(new Error('Action not found'),{status:404});
 }

 if(actorId){
  const actor=await pool.query(`SELECT id FROM users WHERE id=$1 AND organization_id=$2 AND active=true LIMIT 1`,[actorId,organizationId]);
  if(!actor.rows.length)throw Object.assign(new Error('Actor not found'),{status:403});
 }

 const feedback=(await pool.query(`
  INSERT INTO care_feedback(
   organization_id,person_id,action_id,actor_id,feedback_type,sentiment,note,context,observed_at,created_at,updated_at
  )VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),NOW())
  RETURNING *
 `,[organizationId,personId,actionId,actorId,feedbackType,sentiment,clean(note),context&&typeof context==='object'?context:{}])).rows[0];

 const positive=['positive','successful','helpful','worked','relationship_strengthened'].includes(feedbackType);
 const negative=['negative','unsuccessful','ineffective','did_not_work','wrong_approach','wrong_timing','timing_wrong'].includes(feedbackType);

 const outcome=(await pool.query(`
  INSERT INTO intelligence_outcomes(
   organization_id,person_id,action_id,action_type,outcome,outcome_score,evidence,actor_id,feedback_id,observed_at,created_at
  )
  SELECT $1,$2,$3,COALESCE(a.type,'care_feedback'),$4,$5,$6,$7,$8,$9,NOW()
  FROM(SELECT 1)q
  LEFT JOIN aria_actions a ON a.id=$3 AND a.organization_id=$1
  RETURNING *
 `,[
  organizationId,
  personId,
  actionId,
  feedbackType,
  positive?1:negative?0:null,
  {feedback_type:feedbackType,sentiment,note:clean(note),context},
  actorId,
  feedback.id,
  feedback.observed_at
 ])).rows[0];

 await pool.query(`
  INSERT INTO timeline_events(people_id,event_type,title,description,metadata,source,occurred_at,created_at)
  VALUES($1,'care_feedback','Care feedback',COALESCE($2,$3),$4,'human',$5,NOW())
 `,[
  personId,
  clean(note,1000),
  `Human feedback: ${feedbackType}`,
  {feedback_id:feedback.id,action_id,feedback_type,sentiment},
  feedback.observed_at
 ]);

 await learnFromFeedback({
  organizationId,
  personId,
  feedbackId:feedback.id,
  actionId,
  feedbackType,
  sentiment,
  context
 });

 const intelligence=await updatePeopleIntelligence(personId,organizationId);
 const state=await updatePersonState(personId,organizationId);

 return{feedback,outcome,intelligence,state};
}

export async function getCareFeedback({organizationId,personId,limit=20}){
 if(!organizationId)throw new Error('organizationId required');
 const safeLimit=Math.min(Math.max(Number(limit)||20,1),100);
 const params=[organizationId];
 let where='organization_id=$1';
 if(personId){params.push(personId);where+=' AND person_id=$2'}
 params.push(safeLimit);
 const result=await pool.query(`SELECT * FROM care_feedback WHERE ${where} ORDER BY observed_at DESC LIMIT $${params.length}`,params);
 return result.rows;
}

export async function summarizeCareFeedback({organizationId,personId}){
 const rows=await getCareFeedback({organizationId,personId,limit:50});
 const counts={positive:0,negative:0,neutral:0,mixed:0};
 for(const row of rows){
  const s=SENTIMENTS.includes(row.sentiment)?row.sentiment:'neutral';
  counts[s]++;
 }
 const patterns=[];
 for(const type of TYPES){
  const count=rows.filter(r=>r.feedback_type===type).length;
  if(count)patterns.push({type,count});
 }
 return{
  count:rows.length,
  ...counts,
  patterns:patterns.sort((a,b)=>b.count-a.count),
  guidance:
   counts.negative>counts.positive?
    'Use a gentler, more personal approach and avoid assuming the reason for contact.':
   counts.positive>counts.negative?
    'The current care approach appears to be working; preserve the personal tone.':
   null
 };
    }
