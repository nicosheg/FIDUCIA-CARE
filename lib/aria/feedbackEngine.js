// lib/aria/feedbackEngine.js
import pool from '../db';

const TYPES=['positive','negative','neutral','no_response','successful','unsuccessful','needs_follow_up','wrong_approach','wrong_timing','other'];
const SENTIMENTS=['positive','negative','neutral','mixed'];

function clean(v,max=3000){return String(v??'').trim().slice(0,max)}

export async function recordCareFeedback({organizationId,personId,feedbackType,sentiment='neutral',note='',actionId=null}){
 if(!organizationId)throw new Error('organizationId required');
 if(!personId)throw new Error('personId required');
 if(!TYPES.includes(feedbackType))throw new Error('Invalid feedback type');
 if(!SENTIMENTS.includes(sentiment))throw new Error('Invalid sentiment');

 const person=await pool.query(
  `SELECT id FROM people WHERE id=$1 AND organization_id=$2 AND COALESCE(status,'active')='active' LIMIT 1`,
  [personId,organizationId]
 );

 if(!person.rows.length)throw Object.assign(new Error('Person not found'),{status:404});

 if(actionId){
  const action=await pool.query(
   `SELECT id FROM aria_actions WHERE id=$1 AND organization_id=$2 AND person_id=$3 LIMIT 1`,
   [actionId,organizationId,personId]
  );
  if(!action.rows.length)throw Object.assign(new Error('Action not found'),{status:404});
 }

 const result=await pool.query(
  `INSERT INTO care_feedback(
    organization_id,person_id,feedback_type,sentiment,note,observed_at
   )VALUES($1,$2,$3,$4,$5,NOW())
   RETURNING *`,
  [organizationId,personId,feedbackType,sentiment,clean(note),]
 );

 await pool.query(
  `INSERT INTO timeline_events(
    people_id,event_type,title,description,metadata,source,occurred_at,created_at
   )VALUES($1,'care_feedback','Care feedback',$2,$3,'aria',NOW(),NOW())`,
  [
   personId,
   clean(note||`Care feedback: ${feedbackType}`,1000),
   {feedback_type:feedbackType,sentiment,action_id:actionId||null}
  ]
 );

 return result.rows[0];
}

export async function getCareFeedback({organizationId,personId,limit=20}){
 if(!organizationId)throw new Error('organizationId required');

 const safeLimit=Math.min(Math.max(Number(limit)||20,1),100);

 const params=[organizationId];
 let where='organization_id=$1';

 if(personId){
  params.push(personId);
  where+=' AND person_id=$2';
 }

 params.push(safeLimit);

 const result=await pool.query(
  `SELECT * FROM care_feedback
   WHERE ${where}
   ORDER BY observed_at DESC
   LIMIT $${params.length}`,
  params
 );

 return result.rows;
}

export async function summarizeCareFeedback({organizationId,personId}){
 const rows=await getCareFeedback({organizationId,personId,limit:50});

 if(!rows.length){
  return{
   count:0,
   positive:0,
   negative:0,
   neutral:0,
   patterns:[],
   guidance:null
  };
 }

 const counts={
  positive:0,
  negative:0,
  neutral:0,
  mixed:0
 };

 for(const row of rows){
  const sentiment=SENTIMENTS.includes(row.sentiment)?row.sentiment:'neutral';
  counts[sentiment]++;
 }

 const patterns=[];

 for(const type of TYPES){
  const count=rows.filter(row=>row.feedback_type===type).length;
  if(count)patterns.push({type,count});
 }

 let guidance=null;

 if(counts.negative>counts.positive){
  guidance='Use a gentler, more personal approach and avoid assuming the reason for contact.';
 }else if(counts.positive>counts.negative){
  guidance='The current care approach appears to be working; preserve the personal tone.';
 }

 return{
  count:rows.length,
  ...counts,
  patterns:patterns.sort((a,b)=>b.count-a.count),
  guidance
 };
}
