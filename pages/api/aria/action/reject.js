// pages/api/aria/action/reject.js
import{withAdmin}from'../../../../lib/apiHelpers';
import{rejectAction}from'../../../../lib/aria/recommendationEngine';

export default withAdmin(async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const{actionId,reason}=req.body||{};
  if(!actionId)return res.status(400).json({error:'actionId required'});
  const action=await rejectAction(actionId,req.org.id,reason||null);
  if(!action)return res.status(409).json({error:'Action not found or no longer cancellable.'});
  return res.status(200).json({success:true,action});
 }catch(e){
  console.error('[ARIA] reject',e);
  return res.status(e.status||500).json({error:e.message||'Unable to reject ARIA action.'});
 }
});
