// pages/api/aria/chat.js
import { withOrg } from '../../../lib/apiHelpers';
import { handleConversation } from '../../../lib/aria/conversationEngine';

async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const result=await handleConversation({
   organizationId:req.org.id,
   message:req.body?.message,
   history:req.body?.history
  });
  return res.status(200).json(result);
 }catch(err){
  console.error('[ARIA] Conversation error:',err);
  return res.status(err.status||500).json({error:err.message||'ARIA could not process that request.'});
 }
}

export default withOrg(handler);
