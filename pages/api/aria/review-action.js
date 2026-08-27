// pages/api/aria/review-action.js
import {
  approveAction,
  rejectAction,
  executeAction
} from '../../../lib/aria/recommendationEngine';
import { withAdmin } from '../../../lib/apiHelpers';

async function handler(req,res){
  if(req.method!=='POST'){
    return res.status(405).json({error:'Method not allowed'});
  }

  const{actionId,action,reason}=req.body||{};
  const orgId=req.org.id;
  const userId=req.user.id;

  if(!actionId)return res.status(400).json({error:'actionId required'});
  if(!action)return res.status(400).json({error:'action required'});

  try{
    let result;

    switch(action){
      case 'approve':
        result=await approveAction(actionId,orgId,userId);
        if(!result)return res.status(409).json({error:'Action not found or not proposed'});
        break;

      case 'reject':
        result=await rejectAction(actionId,orgId,reason||null);
        if(!result)return res.status(409).json({error:'Action not found or not cancellable'});
        break;

      case 'execute':
        result=await executeAction(actionId,orgId);
        break;

      default:
        return res.status(400).json({
          error:'Invalid action. Use approve, reject, or execute.'
        });
    }

    return res.status(200).json({
      success:true,
      action:result
    });
  }catch(err){
    console.error('[ARIA] Review action error:',err);
    return res.status(500).json({error:err.message});
  }
}

export default withAdmin(handler);
