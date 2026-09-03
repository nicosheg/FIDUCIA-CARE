// pages/api/identity/resolve.js
import pool from '../../../lib/db';
import { withAdmin } from '../../../lib/apiHelpers';
import { normalizeName } from '../../../lib/scanValidation';

async function handler(req,res){
 if(req.method!=='POST'){
  res.setHeader('Allow','POST');
  return res.status(405).end();
 }
 const {scan_job_id,extracted_name,action,target_person_id,new_name,new_phone}=req.body||{};
 if(!scan_job_id||!extracted_name||!action)return res.status(400).json({error:'Missing required fields'});
 const orgId=req.org.id;
 try{
  const jobRes=await pool.query(`SELECT result FROM scan_jobs WHERE id=$1 AND organization_id=$2 LIMIT 1`,[scan_job_id,orgId]);
  if(!jobRes.rows.length)return res.status(404).json({error:'Scan job not found'});
  const result=jobRes.rows[0].result||{};
  const needsReview=Array.isArray(result.needs_review)?result.needs_review:[];
  const itemIndex=needsReview.findIndex(item=>item.extracted_name===extracted_name);
  if(itemIndex===-1)return res.status(404).json({error:'Review item not found'});
  const item=needsReview[itemIndex];
  if(item.resolved)return res.status(400).json({error:'Already resolved'});
  let resolvedPersonId=null,resolutionAction=action;
  if(action==='confirm'){
   if(!target_person_id)return res.status(400).json({error:'target_person_id required'});
   const person=await pool.query(`SELECT id,first_name FROM people WHERE id=$1 AND organization_id=$2 AND COALESCE(status,'active')='active' LIMIT 1`,[target_person_id,orgId]);
   if(!person.rows.length)return res.status(404).json({error:'Person not found'});
   resolvedPersonId=target_person_id;
   if(normalizeName(person.rows[0].first_name)!==normalizeName(extracted_name)){
    await pool.query(`INSERT INTO person_aliases(organization_id,person_id,alias,source,confidence) VALUES($1,$2,$3,'human_confirmed',$4)`,[
     orgId,target_person_id,extracted_name,item.confidence||85
    ]);
   }
   await pool.query(`UPDATE people SET living_truth=NULL,updated_at=NOW() WHERE id=$1 AND organization_id=$2`,[target_person_id,orgId]);
  }else if(action==='keep_new'||action==='edit'){
   const name=String(new_name||extracted_name).trim();
   const phone=String(new_phone||item.extracted_phone||'').trim()||null;
   if(!name)return res.status(400).json({error:'A name is required'});
   const insert=await pool.query(`INSERT INTO people(organization_id,first_name,phone,type,status,confidence,source,created_by,living_truth) VALUES($1,$2,$3,'visitor','active',$4,'scan',$5,$6) RETURNING id`,[
    orgId,name,phone,item.confidence||70,req.user.id,
    JSON.stringify({status:'alive',confidence:item.confidence||70,source:'human_resolved_scan',updated_at:new Date().toISOString()})
   ]);
   resolvedPersonId=insert.rows[0].id;
   resolutionAction=action==='edit'?'edit_keep_new':'keep_new';
  }else return res.status(400).json({error:`Unsupported action: ${action}`});
  needsReview[itemIndex]={...item,resolved:true,resolved_person_id:resolvedPersonId,resolution_action:resolutionAction,resolved_at:new Date().toISOString(),resolved_by:req.user.id};
  result.needs_review=needsReview;
  await pool.query(`UPDATE scan_jobs SET result=$1 WHERE id=$2 AND organization_id=$3`,[result,scan_job_id,orgId]);
  return res.status(200).json({success:true,resolved:needsReview[itemIndex]});
 }catch(err){
  console.error('Identity resolution error:',err);
  return res.status(500).json({error:'Unable to resolve identity.'});
 }
}
export default withAdmin(handler);
