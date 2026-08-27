// pages/api/aria/review-action.js
import {withOrg} from '../../../lib/apiHelpers';
import {
  approveAction,
  rejectAction,
  executeAction
} from '../../../lib/aria/recommendationEngine';

async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  const orgId=req.org?.id;
  const userId=req.user?.id||req.user?.user_id||req.userId;

  if(!orgId)return res.status(401).json({error:'Organization context required'});
  if(!userId)return res.status(401).json({error:'Authenticated user required'});

  const {actionId,action,reason}=req.body||{};

  if(!actionId)return res.status(400).json({error:'actionId required'});

  try{
    let result;

    switch(action){
      case 'approve':
        result=await approveAction(actionId,orgId,userId);
        if(!result)return res.status(409).json({error:'Action not found or no longer proposed'});
        break;

      case 'reject':
      case 'cancel':
        result=await rejectAction(actionId,orgId,reason||null);
        if(!result)return res.status(409).json({error:'Action not found or cannot be cancelled'});
        break;

      case 'execute':
        result=await executeAction(actionId,orgId,userId);
        break;

      default:
        return res.status(400).json({error:'Invalid action'});
    }

    return res.status(200).json({action:result});
  }catch(err){
    console.error('[ARIA] Review action error:',err);
    return res.status(500).json({error:err.message});
  }
}

export default withOrg(handler);
