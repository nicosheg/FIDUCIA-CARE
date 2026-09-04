// pages/api/aria/cycle.js
import{withOrg}from'../../../lib/apiHelpers';
import{runCareCycle}from'../../../lib/aria/careCycle';

export default withOrg(async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 try{
  const result=await runCareCycle(req.org.id,{force:req.body?.force===true});
  return res.status(200).json({ok:true,...result});
 }catch(e){
  console.error('[ARIA] cycle',e);
  return res.status(500).json({error:'Unable to refresh ARIA care intelligence.'});
 }
});
