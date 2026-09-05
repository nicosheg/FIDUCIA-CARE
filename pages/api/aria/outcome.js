// pages/api/aria/outcome.js
import{withAdmin}from'../../../lib/apiHelpers';
import{recordOutcome}from'../../../lib/aria/outcomeEngine';

export default withAdmin(async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const{personId,outcome,outcomeScore,actionId,evidence}=req.body||{};
  if(!personId||!outcome)return res.status(400).json({error:'personId and outcome are required'});
  const result=await recordOutcome(req.org.id,personId,outcome,outcomeScore??null,actionId||null,evidence||{},req.user.id,null);
  return res.status(201).json({success:true,...result});
 }catch(e){
  console.error('[ARIA] outcome',e);
  return res.status(e.status||500).json({error:e.message||'Unable to record outcome.'});
 }
});
