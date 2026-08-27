// pages/api/recommendations.js
import {getPendingActions} from '../../lib/aria/recommendationEngine';
import {withOrg} from '../../lib/apiHelpers';

async function handler(req,res){
  if(req.method!=='GET')return res.status(405).end();

  const orgId=req.org.id;
  const limit=parseInt(req.query.limit,10)||50;

  try{
    const items=await getPendingActions(orgId,limit);
    return res.status(200).json(items);
  }catch(err){
    console.error('[ARIA] Pending actions error:',err);
    return res.status(500).json({error:err.message});
  }
}

export default withOrg(handler);
