// pages/api/aria/cycle.js
import{withOrg}from'../../../lib/apiHelpers';
import{runCareCycle}from'../../../lib/aria/careCycle';

export default withOrg(async function handler(req,res){
 if(req.method!=='POST'){
  res.setHeader('Allow','POST');
  return res.status(405).json({error:'Method not allowed'});
 }
 try{
  const force=req.body?.force===true;
  const result=await runCareCycle(req.org.id,{force});
  return res.status(200).json({ok:true,...result});
 }catch(err){
  console.error('[ARIA] Care cycle:',err);
  return res.status(500).json({error:'ARIA could not refresh its internal care state.'});
 }
});
