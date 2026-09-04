// pages/api/aria/action/reject.js
import {withAdmin} from '../../../../lib/apiHelpers';
import {rejectAction} from '../../../../lib/aria/recommendationEngine';

async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

 try{
  const actionId=req.body?.actionId;
  const reason=req.body?.reason||null;

  if(!actionId)return res.status(400).json({error:'actionId required'});

  const action=await rejectAction(actionId,req.org.id,reason);

  if(!action)return res.status(409).json({error:'Action not found or no longer cancellable.'});

  return res.status(200).json({success:true,action});
 }catch(err){
  console.error('[ARIA] Action rejection error:',err);
  return res.status(err.status||500).json({error:err.message||'Unable to reject ARIA action.'});
 }
}

export default withAdmin(handler);
