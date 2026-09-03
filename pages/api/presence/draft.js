// pages/api/presence/draft.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';
import { generateChatCompletion } from '../../../lib/aiProvider';

export default withOrg(async function handler(req,res){
 if(req.method!=='POST'){
  res.setHeader('Allow','POST');
  return res.status(405).end();
 }

 const{person_id}=req.body||{};
 if(!person_id)return res.status(400).json({error:'Person ID required'});

 const orgId=req.org.id;

 try{
  const personRes=await pool.query(`SELECT * FROM people WHERE id=$1 AND organization_id=$2 AND COALESCE(status,'active')='active' LIMIT 1`,[person_id,orgId]);
  if(!personRes.rows.length)return res.status(404).json({error:'Person not found'});

  const person=personRes.rows[0];

  const timelineRes=await pool.query(`SELECT * FROM timeline_events WHERE people_id=$1 ORDER BY COALESCE(occurred_at,created_at) DESC,created_at DESC LIMIT 10`,[person_id]);

  let context=`Name: ${person.display_name||[person.first_name,person.last_name].filter(Boolean).join(' ')||person.first_name}\nType: ${person.type||'person'}\n`;
  if(person.phone)context+=`Phone: ${person.phone}\n`;

  if(timelineRes.rows.length){
   context+='Recent history:\n';
   timelineRes.rows.forEach(e=>{context+=`- [${e.event_type}] ${e.description||e.title||''} (${e.occurred_at||e.created_at})\n`});
  }

  const systemPrompt=`You are ARIA, the relationship-care assistant for NYEOCARE. Write a warm, human, personalised follow-up message for a person in an organization. Use only supplied facts. Never invent details. Never make the person feel monitored or analysed. Do not mention AI, scoring, churn, attendance monitoring, databases, internal systems, or risk. The purpose is genuine human care. Keep it concise and natural.`;

  const draft=await generateChatCompletion({
   systemPrompt,
   userPrompt:context,
   temperature:.8,
   max_tokens:200
  });

  const message=String(draft||'').trim();
  if(!message)return res.status(500).json({error:'Unable to create message.'});

  await pool.query(`INSERT INTO timeline_events(people_id,event_type,title,description,metadata,source,occurred_at,created_at) VALUES($1,'aria_draft','ARIA care draft',$2,$3,'aria',NOW(),NOW())`,[
   person_id,
   message.substring(0,2000),
   JSON.stringify({type:'draft',actor_id:req.user.id,requires_human_send:true,channel:'whatsapp'})
  ]);

  return res.status(200).json({
   message,
   requiresHumanSend:true,
   whatsappUrl:person.phone?`https://wa.me/${String(person.phone).replace(/[^\d]/g,'')}?text=${encodeURIComponent(message)}`:null,
   feedbackPrompt:'After the follow-up, tell ARIA what happened so future care can become more personal.'
  });
 }catch(err){
  console.error('ARIA draft error:',err);
  return res.status(500).json({error:'Unable to create message.'});
 }
});
