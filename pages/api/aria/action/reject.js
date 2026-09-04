// pages/api/aria/action/reject.js
import { withOrg } from '../../../../lib/apiHelpers';
import { rejectAction } from '../../../../lib/aria/recommendationEngine';

async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const actionId=req.body?.actionId;
  if(!actionId)return res.status(400).json({error:'actionId required'});
  const action=await rejectAction(actionId,req.org.id,req.body?.reason||null);
  if(!action)return res.status(404).json({error:'Action not found or no longer available.'});
  return res.status(200).json({action});
 }catch(err){
  console.error('[ARIA] Action rejection error:',err);
  return res.status(500).json({error:'Unable to reject ARIA action.'});
 }
}

export default withOrg(handler);
