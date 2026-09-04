// pages/api/aria/voice/transcribe.js
import formidable from 'formidable';
import fs from 'fs/promises';
import { withOrg } from '../../../../lib/apiHelpers';
import { transcribeAudio } from '../../../../lib/aiGateway';

export const config={api:{bodyParser:false}};

function parse(req){
 return new Promise((resolve,reject)=>{
  const form=formidable({multiples:false,maxFileSize:Number(process.env.ARIA_MAX_AUDIO_BYTES)||25*1024*1024});
  form.parse(req,(err,fields,files)=>{
   if(err)return reject(err);
   resolve({fields,files});
  });
 });
}

export default withOrg(async function handler(req,res){
 if(req.method!=='POST'){
  res.setHeader('Allow','POST');
  return res.status(405).json({error:'Method not allowed'});
 }
 try{
  const{fields,files}=await parse(req);
  const raw=files.audio||files.file;
  const file=Array.isArray(raw)?raw[0]:raw;
  if(!file)return res.status(400).json({error:'Audio file required'});
  const buffer=await fs.readFile(file.filepath);
  const language=Array.isArray(fields.language)?fields.language[0]:fields.language||'en';
  const prompt=Array.isArray(fields.prompt)?fields.prompt[0]:fields.prompt||'';
  const result=await transcribeAudio({
   buffer,
   mimeType:file.mimetype||'audio/webm',
   filename:file.originalFilename||'aria.webm',
   language,
   prompt,
   organizationId:req.org.id
  });
  return res.status(200).json({text:result.text,requestId:result.requestId,model:result.model});
 }catch(err){
  console.error('[ARIA] Transcription error:',err);
  return res.status(err.status||500).json({error:err.message||'Unable to transcribe audio.'});
 }
});
