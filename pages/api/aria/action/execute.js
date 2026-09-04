// pages/api/aria/action/execute.js
import {withAdmin} from '../../../../lib/apiHelpers';
import {executeAction} from '../../../../lib/aria/recommendationEngine';

async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

 try{
  const actionId=req.body?.actionId;
  if(!actionId)return res.status(400).json({error:'actionId required'});

  const action=await executeAction(actionId,req.org.id);

  return res.status(200).json({success:true,action});
 }catch(err){
  console.error('[ARIA] Action execution error:',err);
  return res.status(err.status||500).json({error:err.message||'Unable to execute ARIA action.'});
 }
}

export default withAdmin(handler);
