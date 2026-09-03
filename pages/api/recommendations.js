// pages/api/recommendations.js
import{getPendingActions}from'../../lib/aria/recommendationEngine';
import{generateCareRecommendations}from'../../lib/aria/careEngine';
import{withOrg}from'../../lib/apiHelpers';

async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 try{
  const orgId=req.org.id;
  const limit=Math.min(Math.max(parseInt(req.query.limit,10)||10,1),50);
  await generateCareRecommendations(orgId);
  const items=await getPendingActions(orgId,limit);
  return res.status(200).json(items);
 }catch(err){
  console.error('[ARIA] Recommendations error:',err);
  return res.status(500).json({error:'Unable to load ARIA recommendations.'});
 }
}

export default withOrg(handler);
