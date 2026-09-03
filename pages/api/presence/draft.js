// pages/api/presence/draft.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';
import { generateChatCompletion } from '../../../lib/aiProvider';

export default withOrg(async function handler(req,res){
 if(req.method!=='POST'){
  res.setHeader('Allow','POST');
  return res.status(405).end();
 }
 const {person_id}=req.body||{};
 if(!person_id)return res.status(400).json({error:'Person ID required'});
 const orgId=req.org.id;
 try{
  const personRes=await pool.query(`SELECT * FROM people WHERE id=$1 AND organization_id=$2 AND COALESCE(status,'active')='active' LIMIT 1`,[person_id,orgId]);
  if(!personRes.rows.length)return res.status(404).json({error:'Person not found'});
  const person=personRes.rows[0];
  const timelineRes=await pool.query(`SELECT * FROM timeline_events WHERE person_id=$1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 10`,[person_id,orgId]);
  const timeline=timelineRes.rows;
  let context=`Name: ${person.display_name||[person.first_name,person.last_name].filter(Boolean).join(' ')||person.first_name}\nType: ${person.type||'person'}\n`;
  if(person.phone)context+=`Phone: ${person.phone}\n`;
  if(timeline.length){
   context+='Recent history:\n';
   timeline.forEach(e=>{context+=`- [${e.event_type}] ${e.description} (${e.created_at})\n`});
  }
  const systemPrompt=`You are ARIA, the relationship-care assistant for NYEOCARE. Write a warm, personalised follow-up message for a person in an organization. Use only the supplied facts. Never invent details. Keep it under 160 characters. Do not mention internal AI systems.`;
  const draft=await generateChatCompletion({
   systemPrompt,
   userPrompt:context,
   temperature:.8,
   max_tokens:200
  });
  const message=String(draft||'').trim();
  if(!message)return res.status(500).json({error:'Unable to create message.'});
  await pool.query(`INSERT INTO timeline_events(person_id,organization_id,event_type,channel,description,metadata) VALUES($1,$2,'aria_draft','whatsapp',$3,$4)`,[
   person_id,orgId,message.substring(0,1000),JSON.stringify({type:'draft',actor_id:req.user.id})
  ]);
  return res.status(200).json({message});
 }catch(err){
  console.error('ARIA draft error:',err);
  return res.status(500).json({error:'Unable to create message.'});
 }
});
