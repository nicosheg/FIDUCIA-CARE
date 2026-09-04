// lib/aiProvider.js
import { getModelConfig } from './modelRegistry';
import { logAIUsage } from './aiObserver';
import { reserveBudget,confirmReservation,cancelReservation } from './budgetGuard';
import { randomUUID } from 'crypto';

const GROQ_API_KEY=process.env.GROQ_API_KEY;
const GROQ_URL='https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL_KEY=process.env.GROQ_VISION_MODEL_KEY||'groq-qwen3.6-27b';
const REQUEST_TIMEOUT_MS=45000;
const MAX_RETRY_AFTER_SEC=60;

function retryable(status){return[429,500,502,503,504].includes(status)}

async function callGroq(imageBase64,isRetry,options={}){
 if(!GROQ_API_KEY)throw Object.assign(new Error('AI service is not configured'),{status:503,retryable:false});
 if(!imageBase64||typeof imageBase64!=='string'||imageBase64.length<10)throw Object.assign(new Error('Invalid image data'),{status:400,retryable:false});
 const{organization_id,job_id,purpose='scan',prompt_version='v2',attempt=1,evaluation=false}=options;
 const config=getModelConfig(DEFAULT_MODEL_KEY);
 let reservationId=null;
 let settled=false;
 if(!evaluation){
  const budget=await reserveBudget(organization_id,purpose,DEFAULT_MODEL_KEY);
  if(!budget.allowed)throw Object.assign(new Error('AI service temporarily unavailable'),{status:429,retryable:false});
  reservationId=budget.reservationId;
 }
 const requestId=randomUUID();
 const started=Date.now();
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
 try{
  const system=`You are ARIA. Extract every person's name and phone number from this register photo. Return ONLY a JSON object with a "people" array. Each item has "name" and "phone". Do not include reasoning, explanations, markdown, or thinking. If a phone number is unreadable, return null.`;
  const response=await fetch(GROQ_URL,{
   method:'POST',
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${GROQ_API_KEY}`},
   body:JSON.stringify({
    model:config.model,
    messages:[
     {role:'system',content:isRetry?`${system} Focus on accuracy. If unclear, return null.`:system},
     {role:'user',content:[{type:'image_url',image_url:{url:`data:image/jpeg;base64,${imageBase64}`}},{type:'text',text:'Output the JSON object now.'}]}
    ],
    temperature:0,
    max_completion_tokens:config.max_completion_tokens,
    response_format:{type:'json_object'},
    reasoning_effort:'none'
   }),
   signal:controller.signal
  });
  const latency=Date.now()-started;
  let data={};
  try{data=await response.json()}catch{}
  const headers=response.headers;
  const retryAfter=headers.get('retry-after');
  if(!response.ok){
   if(reservationId&&!settled){await cancelReservation(reservationId);settled=true}
   if(!evaluation)await logAIUsage({
    organization_id,job_id,request_id:requestId,model_key:DEFAULT_MODEL_KEY,provider:'groq',model:config.model,purpose,prompt_version,attempt,
    latency_ms:latency,finish_reason:'error',http_status:response.status,success:false,retry_reason:data?.error?.message||`HTTP ${response.status}`,
    rate_limit_remaining_tokens:headers.get('x-ratelimit-remaining-tokens'),rate_limit_remaining_requests:headers.get('x-ratelimit-remaining-requests'),
    rate_limit_reset_tokens:headers.get('x-ratelimit-reset-tokens'),rate_limit_reset_requests:headers.get('x-ratelimit-reset-requests'),retry_after:retryAfter
   });
   throw Object.assign(new Error('AI service temporarily unavailable'),{status:response.status,retryable:retryable(response.status),retryAfter});
  }
  const content=data?.choices?.[0]?.message?.content;
  const usage=data?.usage||{};
  const inputTokens=Number(usage.prompt_tokens);
  const outputTokens=Number(usage.completion_tokens);
  if(typeof content!=='string'||!content.trim())throw Object.assign(new Error('Invalid AI response'),{status:502,retryable:true});
  if(!Number.isFinite(inputTokens)||!Number.isFinite(outputTokens))throw Object.assign(new Error('AI response accounting error'),{status:500,retryable:false});
  const actualCost=inputTokens/1000*config.input_cost_per_1k+outputTokens/1000*config.output_cost_per_1k;
  if(reservationId&&!evaluation){
   if(!await confirmReservation(reservationId,actualCost))throw Object.assign(new Error('AI accounting confirmation failed'),{status:500,retryable:false});
   settled=true;
  }
  if(!evaluation)await logAIUsage({
   organization_id,job_id,request_id:requestId,model_key:DEFAULT_MODEL_KEY,provider:'groq',model:config.model,purpose,prompt_version,attempt,
   input_tokens:inputTokens,output_tokens:outputTokens,latency_ms:latency,finish_reason:data.choices[0].finish_reason||'stop',http_status:response.status,success:true,retry_reason:null,
   rate_limit_remaining_tokens:headers.get('x-ratelimit-remaining-tokens'),rate_limit_remaining_requests:headers.get('x-ratelimit-remaining-requests'),
   rate_limit_reset_tokens:headers.get('x-ratelimit-reset-tokens'),rate_limit_reset_requests:headers.get('x-ratelimit-reset-requests'),retry_after:retryAfter
  });
  return{data,provider:'groq',model:config.model,modelKey:DEFAULT_MODEL_KEY,requestId,usage:{prompt_tokens:inputTokens,completion_tokens:outputTokens},attempt};
 }finally{
  clearTimeout(timer);
  if(reservationId&&!settled)try{await cancelReservation(reservationId)}catch{}
 }
}

export async function callVisionWithRetry(imageBase64,onRetry=null,options={}){
 let lastError=null;
 for(let attempt=1;attempt<=3;attempt++){
  try{return{...(await callGroq(imageBase64,attempt>1,{...options,attempt})),attempt}}
  catch(err){
   lastError=err;
   if(!err.retryable||attempt>=3)throw err;
   let delay;
   const parsed=Number(err.retryAfter);
   if(Number.isFinite(parsed)&&parsed>=0)delay=Math.min(parsed,MAX_RETRY_AFTER_SEC)*1000;
   else delay=Math.min(2000*Math.pow(2,attempt-1),30000);
   if(onRetry)onRetry(attempt,delay);
   await new Promise(resolve=>setTimeout(resolve,delay));
  }
 }
 throw lastError||new Error('All retries failed');
}
