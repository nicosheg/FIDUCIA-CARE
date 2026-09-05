// pages/api/conversation/import.js
import pool from'../../../lib/db';
import{withOrg}from'../../../lib/apiHelpers';

const GROQ_API_KEY=process.env.GROQ_API_KEY;
const GROQ_URL='https://api.groq.com/openai/v1/chat/completions';

export default withOrg(async function handler(req,res){
if(req.method!=='POST'){
res.setHeader('Allow','POST');
return res.status(405).json({error:'Method not allowed'});
}
const{person_id,text}=req.body||{};
const cleanText=String(text||'').trim();
if(!person_id||!cleanText)return res.status(400).json({error:'person_id and text are required'});
if(cleanText.length>20000)return res.status(400).json({error:'Conversation is too long.'});
const orgId=req.org.id;
try{
const person=(await pool.query(`SELECT id,first_name FROM people WHERE id=$1 AND organization_id=$2 AND COALESCE(status,'active')='active' LIMIT 1`,[person_id,orgId])).rows[0];
if(!person)return res.status(404).json({error:'Person not found'});
const now=new Date().toISOString();
await pool.query(`INSERT INTO person_communications(organization_id,person_id,channel,direction,status,subject,content,occurred_at,metadata,created_by) VALUES($1,$2,'imported','inbound','completed','Conversation imported',$3,$4,$5,$6)`,[orgId,person_id,cleanText,now,{type:'conversation_import',source:'manual_import'},req.user.id]);
await pool.query(`INSERT INTO timeline_events(people_id,event_type,title,description,metadata,source,occurred_at,created_at) VALUES($1,'communication','Conversation imported',$2,$3,'conversation_import',$4,NOW())`,[person_id,cleanText.substring(0,1000),{channel:'imported',direction:'inbound'},now]);

const systemPrompt=`You are ARIA, an AI assistant for an organization using NYEOCARE. Extract only useful facts, events, needs, commitments, important dates, wellbeing signals and relationship context explicitly supported by the conversation. Do not invent information. Return ONLY a JSON array of objects with type, description and importance. importance must be permanent, important, or temporary.`;
let extractedEvents=[];
if(GROQ_API_KEY){
try{
const response=await fetch(GROQ_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${GROQ_API_KEY}`},body:JSON.stringify({model:'llama-3.1-8b-instant',messages:[{role:'system',content:systemPrompt},{role:'user',content:cleanText.substring(0,2000)}],temperature:.2,max_tokens:500})});
if(response.ok){
const data=await response.json();
const raw=data?.choices?.[0]?.message?.content||'';
const match=raw.replace(/```json|```/g,'').trim().match(/[\s\S]*/);
if(match){
const parsed=JSON.parse(match[0]);
if(Array.isArray(parsed))extractedEvents=parsed.filter(x=>x&&x.description).slice(0,20);
}
}
}catch(err){console.error('Groq extraction failed:',err)}
}
for(const event of extractedEvents){
await pool.query(`INSERT INTO timeline_events(people_id,event_type,title,description,metadata,source,occurred_at,created_at) VALUES($1,$2,$3,$4,$5,'ai',$6,NOW())`,[person_id,String(event.type||'note').substring(0,100),String(event.type||'Conversation insight').substring(0,150),String(event.description).substring(0,1000),{importance:['permanent','important','temporary'].includes(event.importance)?event.importance:'temporary',source:'conversation_import'},now]);
}
return res.status(200).json({success:true,extracted:extractedEvents.length});
}catch(err){
console.error('Conversation import error:',err);
return res.status(500).json({error:'Unable to import conversation.'});
}
});
