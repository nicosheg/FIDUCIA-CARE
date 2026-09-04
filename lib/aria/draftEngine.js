// lib/aria/draftEngine.js
import pool from '../db';
import{generateText}from'../aiGateway';
import{getLearnings}from'./learningEngine';

const clean=(v,max=3000)=>String(v??'').trim().slice(0,max);
const nameOf=p=>clean(p.display_name||[p.first_name,p.last_name].filter(Boolean).join(' ')||p.first_name||'there',120);

function fallback(person,action){
 const first=clean(person.first_name||'there',80);
 const templates={
  welcome_and_onboard:`Hi ${first}, it was lovely having you with us. I just wanted to reach out and say you're remembered and welcome anytime.`,
  continue_onboarding:`Hi ${first}, just checking in to see how you're doing. We're glad to have you with us and would love to stay connected.`,
  personal_follow_up:`Hi ${first}, I wanted to check in and see how you're doing. No pressure at all — just wanted you to know you're remembered.`,
  check_in:`Hi ${first}, just checking in to see how you're doing. Hope you're well. Is there anything you'd like us to know or support you with?`,
  thoughtful_check_in:`Hi ${first}, just wanted to say hello and see how things are going with you. Hope you're doing well.`,
  strengthen_relationship:`Hi ${first}, it's always good to have you around. Just wanted to say hello and let you know we appreciate having you with us.`,
  adjust_care_approach:`Hi ${first}, I wanted to check in personally and see how you're doing. I'd really value hearing how things have been for you.`
 };
 return templates[action]||templates.thoughtful_check_in;
}

export async function createCareDraft({organizationId,personId,actionId=null,actionType='thoughtful_check_in',actorId=null}){
 if(!organizationId||!personId)throw new Error('organizationId and personId are required');

 const[orgRes,personRes,intelligenceRes,memoryRes,timelineRes,feedbackRes,actionRes,learningRes]=await Promise.all([
  pool.query(`SELECT id,name,aria_instructions FROM organizations WHERE id=$1 LIMIT 1`,[organizationId]),
  pool.query(`SELECT id,first_name,last_name,display_name,phone,email,type FROM people WHERE id=$1 AND organization_id=$2 AND COALESCE(status,'active')='active' LIMIT 1`,[personId,organizationId]),
  pool.query(`SELECT lifecycle_state,engagement_score,churn_probability,attention_score,next_best_action,action_reason,evidence FROM people_intelligence WHERE organization_id=$1 AND person_id=$2 LIMIT 1`,[organizationId,personId]),
  pool.query(`SELECT memory_type,content,importance,confidence FROM person_memory WHERE organization_id=$1 AND person_id=$2 AND active=true ORDER BY updated_at DESC LIMIT 12`,[organizationId,personId]),
  pool.query(`SELECT event_type,title,description,occurred_at FROM timeline_events WHERE people_id=$1 ORDER BY occurred_at DESC,created_at DESC LIMIT 12`,[personId]),
  pool.query(`SELECT feedback_type,sentiment,note,observed_at FROM care_feedback WHERE organization_id=$1 AND person_id=$2 ORDER BY observed_at DESC LIMIT 8`,[organizationId,personId]),
  actionId?pool.query(`SELECT id,type,action_metadata,status FROM aria_actions WHERE id=$1 AND organization_id=$2 AND person_id=$3 LIMIT 1`,[actionId,organizationId,personId]):Promise.resolve({rows:[]}),
  getLearnings(organizationId,{personId,limit:20})
 ]);

 if(!personRes.rows.length)throw new Error('Person not found');
 if(actionId&&!actionRes.rows.length)throw new Error('Action not found');

 const person=personRes.rows[0];
 const organization=orgRes.rows[0]||{};
 const intelligence=intelligenceRes.rows[0]||{};
 const facts={
  person:nameOf(person),
  type:person.type||'person',
  organization:organization.name||'organization',
  care_reason:clean(actionRes.rows[0]?.action_metadata?.reason||intelligence.action_reason||'Intentional human care',500),
  recent_memory:memoryRes.rows.map(x=>({type:x.memory_type,content:clean(x.content,500),confidence:x.confidence})),
  recent_history:timelineRes.rows.map(x=>({type:x.event_type,title:clean(x.title,200),description:clean(x.description,500),at:x.occurred_at})),
  human_feedback:feedbackRes.rows.map(x=>({type:x.feedback_type,sentiment:x.sentiment,note:clean(x.note,500),at:x.observed_at})),
  learned_patterns:learningRes.map(x=>({type:x.learning_type,key:x.learning_key,value:x.value,confidence:x.confidence}))
 };

 let message='';
 let generation='fallback';

 try{
  const result=await generateText({
   organizationId,
   purpose:'care_draft',
   maxTokens:180,
   temperature:.65,
   system:`You are ARIA, the care intelligence inside NYEOCARE. Write one short, warm, genuinely human WhatsApp message from an organization to one person. Use only supplied facts and learned patterns. Never mention monitoring, scores, churn, risk, attendance analytics, databases, AI, internal systems, or why the person was selected. Never invent circumstances or personal details. Never pressure the recipient. Respect the organization's voice instructions. Return ONLY the message text. Organization voice: ${clean(organization.aria_instructions,1800)||'Warm, respectful, personal and sincere.'}`,
   user:JSON.stringify(facts)
  });
  message=clean(result.text,2000);
  if(message)generation='ai';
 }catch(err){
  console.error('[ARIA] Draft generation fallback:',err.message);
 }

 if(!message)message=fallback(person,actionType);

 const communication=(await pool.query(`
  INSERT INTO person_communications(
   organization_id,person_id,channel,direction,status,subject,content,metadata,created_by,occurred_at,created_at,updated_at
  )VALUES($1,$2,'whatsapp','outbound','draft',$3,$4,$5,$6,NOW(),NOW(),NOW())
  RETURNING *
 `,[
  organizationId,
  personId,
  'ARIA care draft',
  message,
  {action_id:actionId,action_type:actionType,requires_human_send:true,requires_human_approval:true,generation},
  actorId
 ])).rows[0];

 await pool.query(`
  INSERT INTO timeline_events(
   people_id,event_type,title,description,metadata,source,occurred_at,created_at
  )VALUES($1,'aria_draft','ARIA care draft',$2,$3,'aria',NOW(),NOW())
 `,[personId,message,{communication_id:communication.id,action_id:actionId,requires_human_send:true,generation}]);

 return{
  message,
  communication,
  requiresHumanApproval:true,
  requiresHumanSend:true,
  generation,
  whatsappUrl:person.phone?`https://wa.me/${String(person.phone).replace(/\D/g,'')}?text=${encodeURIComponent(message)}`:null,
  feedbackPrompt:'After the conversation, tell ARIA what happened so future care can become more personal.'
 };
                                                                                                                                                                                }
