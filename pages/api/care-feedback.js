// pages/api/care-feedback.js
import pool from '../../lib/db';
import { withOrg } from '../../lib/apiHelpers';
import { updatePeopleIntelligence } from '../../lib/aria/peopleIntelligence';
import { updatePersonState } from '../../lib/aria/stateManager';

const TYPES=new Set(['positive','negative','helpful','ineffective','worked','did_not_work','relationship_strengthened','new_information','timing_wrong','no_response','other']);

async function handler(req,res){
 const orgId=req.org.id;

 if(req.method==='GET'){
  const personId=String(req.query.person_id||'');
  if(!personId)return res.status(400).json({error:'person_id is required'});
  try{
   const person=await pool.query(`SELECT id FROM people WHERE id=$1 AND organization_id=$2 LIMIT 1`,[personId,orgId]);
   if(!person.rows.length)return res.status(404).json({error:'Person not found'});
   const result=await pool.query(`SELECT f.*,u.name AS actor_name FROM care_feedback f LEFT JOIN users u ON u.id=f.actor_id AND u.organization_id=f.organization_id WHERE f.organization_id=$1 AND f.person_id=$2 ORDER BY f.observed_at DESC LIMIT 100`,[orgId,personId]);
   return res.status(200).json(result.rows);
  }catch(err){
   console.error('[CARE FEEDBACK] GET:',err);
   return res.status(500).json({error:'Unable to load care feedback.'});
  }
 }

 if(req.method==='POST'){
  const{person_id,action_id,feedback_type,sentiment,note,context,observed_at}=req.body||{};
  if(!person_id||!feedback_type)return res.status(400).json({error:'person_id and feedback_type are required'});
  if(!TYPES.has(feedback_type))return res.status(400).json({error:'Invalid feedback_type'});
  try{
   const person=await pool.query(`SELECT id FROM people WHERE id=$1 AND organization_id=$2 AND COALESCE(status,'active')='active' LIMIT 1`,[person_id,orgId]);
   if(!person.rows.length)return res.status(404).json({error:'Person not found'});

   if(action_id){
    const action=await pool.query(`SELECT id FROM aria_actions WHERE id=$1 AND organization_id=$2 AND person_id=$3 LIMIT 1`,[action_id,orgId,person_id]);
    if(!action.rows.length)return res.status(400).json({error:'Invalid action_id'});
   }

   const result=await pool.query(`INSERT INTO care_feedback(organization_id,person_id,action_id,actor_id,feedback_type,sentiment,note,context,observed_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz,NOW()),NOW(),NOW()) RETURNING *`,[orgId,person_id,action_id||null,req.user.id,feedback_type,sentiment||null,String(note||'').trim()||null,context&&typeof context==='object'?context:{},observed_at||null]);

   const feedback=result.rows[0];

   await pool.query(`INSERT INTO intelligence_outcomes(organization_id,person_id,action_id,action_type,outcome,outcome_score,evidence,actor_id,feedback_id,observed_at,created_at) VALUES($1,$2,$3,'care_feedback',$4,$5,$6,$7,$8,$9,NOW())`,[
    orgId,person_id,action_id||null,feedback_type,
    ['positive','helpful','worked','relationship_strengthened'].includes(feedback_type)?1:0,
    JSON.stringify({feedback_type,sentiment,note:feedback.note,context:feedback.context}),
    req.user.id,feedback.id,feedback.observed_at
   ]);

   await pool.query(`INSERT INTO timeline_events(people_id,event_type,title,description,metadata,source,occurred_at,created_at) VALUES($1,'care_feedback','Care feedback',COALESCE($2,$3),$4,'human',COALESCE($5::timestamptz,NOW()),NOW())`,[
    person_id,feedback.note,`Human feedback: ${feedback_type}`,JSON.stringify({feedback_id:feedback.id,action_id:action_id||null,feedback_type,sentiment}),feedback.observed_at
   ]);

   const intelligence=await updatePeopleIntelligence(person_id,orgId);
   const state=await updatePersonState(person_id,orgId);

   return res.status(201).json({feedback,intelligence,state,aria_prompt:'Thank you. ARIA will use this feedback as evidence when deciding how and when to care for this person in the future.'});
  }catch(err){
   console.error('[CARE FEEDBACK] POST:',err);
   return res.status(500).json({error:'Unable to save care feedback.'});
  }
 }

 res.setHeader('Allow','GET,POST');
 return res.status(405).json({error:'Method not allowed'});
}

export default withOrg(handler);
