// pages/api/conversation/import.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

const GROQ_API_KEY=process.env.GROQ_API_KEY;
const GROQ_URL='https://api.groq.com/openai/v1/chat/completions';

export default withOrg(async function handler(req,res){
 if(req.method!=='POST'){
  res.setHeader('Allow','POST');
  return res.status(405).json({error:'Method not allowed'});
 }
 const {person_id,text}=req.body||{};
 if(!person_id||!String(text||'').trim())return res.status(400).json({error:'person_id and text are required'});
 const orgId=req.org.id,cleanText=String(text).trim();
 if(cleanText.length>20000)return res.status(400).json({error:'Conversation is too long.'});
 try{
  const person=await pool.query(`SELECT id,first_name FROM people WHERE id=$1 AND organization_id=$2 AND COALESCE(status,'active')='active' LIMIT 1`,[person_id,orgId]);
  if(!person.rows.length)return res.status(404).json({error:'Person not found'});
  await pool.query(`INSERT INTO timeline_events(person_id,organization_id,event_type,channel,description,metadata) VALUES($1,$2,'conversation_import','manual',$3,$4)`,[
   person_id,orgId,cleanText.substring(0,500),JSON.stringify({type:'raw_import',actor_id:req.user.id})
  ]);
  const systemPrompt=`You are ARIA, an AI assistant for an organization using NYEOCARE. Extract useful facts, events, needs, commitments, important dates, wellbeing signals and relationship context from the supplied conversation. Do not invent information. Return ONLY a JSON array with type, description and importance, where importance is permanent, important, or temporary.`;
  let extractedEvents=[];
  if(GROQ_API_KEY){
   try{
    const response=await fetch(GROQ_URL,{
     method:'POST',
     headers:{'Content-Type':'application/json',Authorization:`Bearer ${GROQ_API_KEY}`},
     body:JSON.stringify({
      model:'llama-3.1-8b-instant',
      messages:[{role:'system',content:systemPrompt},{role:'user',content:cleanText.substring(0,2000)}],
      temperature:.2,max_tokens:500
     })
    });
    if(response.ok){
     const data=await response.json();
     const raw=data?.choices?.[0]?.message?.content||'';
     const match=raw.replace(/```json|```/g,'').trim().match(/\[[\s\S]*\]/);
     if(match){
      const parsed=JSON.parse(match[0]);
      if(Array.isArray(parsed))extractedEvents=parsed.slice(0,20);
     }
    }
   }catch(err){console.error('Groq extraction failed:',err)}
  }
  for(const event of extractedEvents){
   if(!event?.description)continue;
   await pool.query(`INSERT INTO timeline_events(person_id,organization_id,event_type,channel,description,metadata) VALUES($1,$2,$3,'ai',$4,$5)`,[
    person_id,orgId,String(event.type||'note').substring(0,100),String(event.description).substring(0,1000),
    JSON.stringify({importance:event.importance||'temporary',source:'conversation_import',actor_id:req.user.id})
   ]);
  }
  return res.status(200).json({success:true,extracted:extractedEvents.length});
 }catch(err){
  console.error('Conversation import error:',err);
  return res.status(500).json({error:'Unable to import conversation.'});
 }
});
