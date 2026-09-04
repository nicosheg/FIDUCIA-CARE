// lib/aiGateway.js
import { randomUUID } from 'crypto';
import { getModelConfig } from './modelRegistry';
import { logAIUsage } from './aiObserver';
import { reserveBudget,confirmReservation,cancelReservation } from './budgetGuard';

const GROQ_KEY=process.env.GROQ_API_KEY;
const GROQ_BASE='https://api.groq.com/openai/v1';
const DEFAULT_MODEL_KEY=process.env.GROQ_TEXT_MODEL_KEY||process.env.GROQ_VISION_MODEL_KEY||'groq-qwen3.6-27b';
const STT_MODEL_KEY=process.env.GROQ_STT_MODEL_KEY||'groq-whisper-large-v3-turbo';
const TTS_MODEL_KEY=process.env.GROQ_TTS_MODEL_KEY||'groq-orpheus-v1-english';
const TIMEOUT=Number(process.env.ARIA_AI_TIMEOUT_MS)||45000;

function timeoutSignal(ms=TIMEOUT){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),ms);
 return{controller,timer};
}

function requireKey(){
 if(!GROQ_KEY)throw Object.assign(new Error('AI service is not configured'),{status:503,retryable:false});
}

function safeText(value,max=12000){
 return String(value??'').trim().slice(0,max);
}

function retryable(status){
 return [408,429,500,502,503,504].includes(status);
}

async function groqJson(path,payload,options={}){
 requireKey();
 const modelKey=options.modelKey||DEFAULT_MODEL_KEY;
 const config=getModelConfig(modelKey);
 const purpose=options.purpose||'aria';
 const organization_id=options.organization_id||null;
 const job_id=options.job_id||null;
 const prompt_version=options.prompt_version||'v1';
 const evaluation=Boolean(options.evaluation);
 let reservationId=null;
 let settled=false;
 if(!evaluation&&organization_id){
  const budget=await reserveBudget(organization_id,purpose,modelKey);
  if(!budget.allowed){
   const err=Object.assign(new Error('AI service temporarily unavailable'),{status:429,retryable:false,budgetExceeded:true});
   throw err;
  }
  reservationId=budget.reservationId;
 }
 const requestId=randomUUID();
 const started=Date.now();
 const{controller,timer}=timeoutSignal();
 try{
  const response=await fetch(`${GROQ_BASE}${path}`,{
   method:'POST',
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${GROQ_KEY}`},
   body:JSON.stringify(payload),
   signal:controller.signal
  });
  const latency=Date.now()-started;
  let data={};
  try{data=await response.json()}catch{}
  const headers=response.headers;
  const rateLimit={
   remainingTokens:headers.get('x-ratelimit-remaining-tokens'),
   remainingRequests:headers.get('x-ratelimit-remaining-requests'),
   resetTokens:headers.get('x-ratelimit-reset-tokens'),
   resetRequests:headers.get('x-ratelimit-reset-requests')
  };
  if(!response.ok){
   if(reservationId&&!settled){await cancelReservation(reservationId);settled=true}
   if(!evaluation&&organization_id)await logAIUsage({
    organization_id,job_id,request_id:requestId,model_key:modelKey,provider:'groq',model:config.model,purpose,prompt_version,attempt:options.attempt||1,
    latency_ms:latency,finish_reason:'error',http_status:response.status,success:false,retry_reason:data?.error?.message||`HTTP ${response.status}`,
    rate_limit_remaining_tokens:rateLimit.remainingTokens,rate_limit_remaining_requests:rateLimit.remainingRequests,
    rate_limit_reset_tokens:rateLimit.resetTokens,rate_limit_reset_requests:rateLimit.resetRequests,retry_after:headers.get('retry-after')
   });
   const err=Object.assign(new Error('AI service temporarily unavailable'),{status:response.status,retryable:retryable(response.status),retryAfter:headers.get('retry-after')});
   throw err;
  }
  const usage=data.usage||{};
  const inputTokens=Number.isFinite(Number(usage.prompt_tokens))?Number(usage.prompt_tokens):null;
  const outputTokens=Number.isFinite(Number(usage.completion_tokens))?Number(usage.completion_tokens):null;
  if(reservationId&&!settled){
   if(inputTokens===null||outputTokens===null){
    await cancelReservation(reservationId);
    settled=true;
    throw Object.assign(new Error('AI response accounting error'),{status:500,retryable:false});
   }
   const actualCost=(inputTokens/1000)*config.input_cost_per_1k+(outputTokens/1000)*config.output_cost_per_1k;
   const confirmed=await confirmReservation(reservationId,actualCost);
   if(!confirmed)throw Object.assign(new Error('AI accounting confirmation failed'),{status:500,retryable:false});
   settled=true;
  }
  if(!evaluation&&organization_id)await logAIUsage({
   organization_id,job_id,request_id:requestId,model_key:modelKey,provider:'groq',model:config.model,purpose,prompt_version,attempt:options.attempt||1,
   input_tokens:inputTokens,output_tokens:outputTokens,latency_ms:latency,finish_reason:data?.choices?.[0]?.finish_reason||'stop',
   http_status:response.status,success:true,retry_reason:null,
   rate_limit_remaining_tokens:rateLimit.remainingTokens,rate_limit_remaining_requests:rateLimit.remainingRequests,
   rate_limit_reset_tokens:rateLimit.resetTokens,rate_limit_reset_requests:rateLimit.resetRequests,retry_after:headers.get('retry-after')
  });
  return{data,requestId,modelKey,model:config.model,usage:{inputTokens,outputTokens},rateLimit};
 }catch(err){
  if(reservationId&&!settled){
   try{await cancelReservation(reservationId)}catch{}
  }
  if(err.name==='AbortError')throw Object.assign(new Error('AI request timed out'),{status:504,retryable:true});
  throw err;
 }finally{
  clearTimeout(timer);
 }
}

export async function generateText({system='',messages=[],user='',modelKey=DEFAULT_MODEL_KEY,organizationId=null,jobId=null,purpose='aria',maxTokens=500,temperature=.4,json=false}={}){
 const safeMessages=Array.isArray(messages)?messages.map(m=>({role:m.role==='assistant'?'assistant':'user',content:safeText(m.content,16000)})):[];
 if(system)safeMessages.unshift({role:'system',content:safeText(system,16000)});
 if(user)safeMessages.push({role:'user',content:safeText(user,16000)});
 const config=getModelConfig(modelKey);
 const payload={
  model:config.model,
  messages:safeMessages,
  temperature:Math.max(0,Math.min(1,Number(temperature)||0)),
  max_completion_tokens:Math.min(Math.max(Number(maxTokens)||500,1),config.max_completion_tokens)
 };
 if(json&&config.supports_json_object)payload.response_format={type:'json_object'};
 if(config.supports_reasoning_effort)payload.reasoning_effort='none';
 const result=await groqJson('/chat/completions',payload,{modelKey,organization_id:organizationId,job_id:jobId,purpose});
 const content=result.data?.choices?.[0]?.message?.content;
 if(typeof content!=='string'||!content.trim())throw Object.assign(new Error('AI returned an empty response'),{status:502,retryable:true});
 return{...result,text:content.trim()};
}

export async function transcribeAudio({buffer,mimeType='audio/webm',filename='aria.webm',language='en',prompt='',organizationId=null,purpose='aria_voice_transcription'}={}){
 requireKey();
 if(!Buffer.isBuffer(buffer)||!buffer.length)throw Object.assign(new Error('Audio data required'),{status:400});
 const maxBytes=Number(process.env.ARIA_MAX_AUDIO_BYTES)||25*1024*1024;
 if(buffer.length>maxBytes)throw Object.assign(new Error('Audio file is too large'),{status:413});
 const model=getModelConfig(STT_MODEL_KEY).model;
 const form=new FormData();
 form.append('file',new Blob([buffer],{type:mimeType}),filename);
 form.append('model',model);
 form.append('response_format','json');
 if(language)form.append('language',language);
 if(prompt)form.append('prompt',safeText(prompt,900));
 const{controller,timer}=timeoutSignal(60000);
 const requestId=randomUUID();
 const started=Date.now();
 try{
  const response=await fetch(`${GROQ_BASE}/audio/transcriptions`,{
   method:'POST',
   headers:{Authorization:`Bearer ${GROQ_KEY}`},
   body:form,
   signal:controller.signal
  });
  let data={};
  try{data=await response.json()}catch{}
  if(!response.ok)throw Object.assign(new Error('Speech transcription is temporarily unavailable'),{status:response.status,retryable:retryable(response.status)});
  return{text:safeText(data.text,12000),requestId,model,latencyMs:Date.now()-started};
 }finally{clearTimeout(timer)}
}

export async function synthesizeSpeech({text,voice=process.env.ARIA_VOICE||'hannah',organizationId=null,purpose='aria_voice_speech'}={}){
 requireKey();
 const input=safeText(text,200);
 if(!input)throw Object.assign(new Error('Speech text required'),{status:400});
 const model=getModelConfig(TTS_MODEL_KEY).model;
 const{controller,timer}=timeoutSignal(60000);
 try{
  const response=await fetch(`${GROQ_BASE}/audio/speech`,{
   method:'POST',
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${GROQ_KEY}`},
   body:JSON.stringify({model,voice,input,response_format:'wav'}),
   signal:controller.signal
  });
  if(!response.ok)throw Object.assign(new Error('Speech generation is temporarily unavailable'),{status:response.status,retryable:retryable(response.status)});
  return{buffer:Buffer.from(await response.arrayBuffer()),mimeType:'audio/wav',model,voice};
 }finally{clearTimeout(timer)}
}

export async function aiHealth(){
 return{provider:GROQ_KEY?'groq':'fallback',configured:Boolean(GROQ_KEY),textModel:getModelConfig(DEFAULT_MODEL_KEY).model,sttModel:getModelConfig(STT_MODEL_KEY).model,ttsModel:getModelConfig(TTS_MODEL_KEY).model};
}
