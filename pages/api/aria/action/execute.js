// pages/api/aria/action/execute.js
import{withAdmin}from'../../../../lib/apiHelpers';
import{executeAction}from'../../../../lib/aria/recommendationEngine';

export default withAdmin(async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const{actionId}=req.body||{};
  if(!actionId)return res.status(400).json({error:'actionId required'});
  const action=await executeAction(actionId,req.org.id);
  return res.status(200).json({success:true,action});
 }catch(e){
  console.error('[ARIA] execute',e);
  return res.status(e.status||500).json({error:e.message||'Unable to process ARIA action.'});
 }
});
