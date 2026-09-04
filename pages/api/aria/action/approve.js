// pages/api/aria/action/approve.js
import{withAdmin}from'../../../../lib/apiHelpers';
import{approveAction}from'../../../../lib/aria/recommendationEngine';

export default withAdmin(async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const{actionId}=req.body||{};
  if(!actionId)return res.status(400).json({error:'actionId required'});
  const action=await approveAction(actionId,req.org.id,req.user.id);
  if(!action)return res.status(409).json({error:'Action not found or no longer available.'});
  return res.status(200).json({success:true,action});
 }catch(e){
  console.error('[ARIA] approve',e);
  return res.status(e.status||500).json({error:e.message||'Unable to approve ARIA action.'});
 }
});
