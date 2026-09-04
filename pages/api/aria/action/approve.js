// pages/api/aria/action/approve.js
import {withAdmin} from '../../../../lib/apiHelpers';
import {approveAction} from '../../../../lib/aria/recommendationEngine';

async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

 try{
  const actionId=req.body?.actionId;
  if(!actionId)return res.status(400).json({error:'actionId required'});

  const action=await approveAction(actionId,req.org.id,req.user.id);

  if(!action)return res.status(409).json({error:'Action not found or no longer available for approval.'});

  return res.status(200).json({success:true,action});
 }catch(err){
  console.error('[ARIA] Action approval error:',err);
  return res.status(err.status||500).json({error:err.message||'Unable to approve ARIA action.'});
 }
}

export default withAdmin(handler);
