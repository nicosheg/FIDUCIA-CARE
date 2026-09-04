// pages/api/aria/chat.js
import{withOrg}from'../../../lib/apiHelpers';
import{handleConversation}from'../../../lib/aria/conversationEngine';

export default withOrg(async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

 try{
  const result=await handleConversation({
   organizationId:req.org.id,
   userId:req.user.id,
   message:req.body?.message,
   history:req.body?.history,
   conversationId:req.body?.conversationId||null
  });

  return res.status(200).json(result);
 }catch(err){
  console.error('[ARIA] Conversation:',err);
  return res.status(err.status||500).json({error:err.message||'ARIA could not process that request.'});
 }
});
