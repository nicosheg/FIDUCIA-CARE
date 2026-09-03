// pages/api/presence/draft.js
import{withOrg}from'../../../lib/apiHelpers';
import{createCareDraft}from'../../../lib/aria/draftEngine';

export default withOrg(async function handler(req,res){
 if(req.method!=='POST'){
  res.setHeader('Allow','POST');
  return res.status(405).json({error:'Method not allowed'});
 }

 const{person_id,action_id,action_type}=req.body||{};
 if(!person_id)return res.status(400).json({error:'Person ID required'});

 try{
  const result=await createCareDraft({
   organizationId:req.org.id,
   personId:person_id,
   actionId:action_id||null,
   actionType:action_type||'thoughtful_check_in'
  });

  return res.status(200).json(result);
 }catch(err){
  console.error('[ARIA] Draft error:',err);
  return res.status(500).json({error:'Unable to create message.'});
 }
});
