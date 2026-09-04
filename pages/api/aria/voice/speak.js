// pages/api/aria/voice/speak.js
import { withOrg } from '../../../../lib/apiHelpers';
import { synthesizeSpeech } from '../../../../lib/aiGateway';

export default withOrg(async function handler(req,res){
 if(req.method!=='POST'){
  res.setHeader('Allow','POST');
  return res.status(405).json({error:'Method not allowed'});
 }
 try{
  const{text,voice}=req.body||{};
  if(!text||typeof text!=='string')return res.status(400).json({error:'Text required'});
  if(text.trim().length>200)return res.status(400).json({error:'Speech text must be 200 characters or fewer.'});
  const result=await synthesizeSpeech({text,voice,organizationId:req.org.id});
  res.statusCode=200;
  res.setHeader('Content-Type',result.mimeType);
  res.setHeader('Content-Length',result.buffer.length);
  res.setHeader('Cache-Control','no-store');
  return res.end(result.buffer);
 }catch(err){
  console.error('[ARIA] Speech error:',err);
  return res.status(err.status||500).json({error:err.message||'Unable to generate speech.'});
 }
});
