// pages/api/people.js
import pool from '../../lib/db';
import { normalizePhone } from '../../lib/phoneUtils';
import { withOrg } from '../../lib/apiHelpers';
import { emitAriaEvent } from '../../lib/aria/eventEmitter';
import { processAriaEvent } from '../../lib/aria/eventProcessor';

async function handler(req,res){
 const orgId=req.org.id;
 if(req.method==='GET'){
  try{
   const {rows}=await pool.query(`SELECT * FROM people WHERE organization_id=$1 AND COALESCE(status,'active')='active' ORDER BY COALESCE(NULLIF(display_name,''),NULLIF(TRIM(CONCAT_WS(' ',first_name,last_name)),''),first_name) ASC`,[orgId]);
   return res.status(200).json(rows);
  }catch(err){
   console.error('GET people error:',err);
   return res.status(500).json({error:'Unable to load people.'});
  }
 }
 if(req.method==='POST'){
  const {first_name,last_name,phone,email,type,birthday}=req.body||{};
  const name=String(first_name||'').trim();
  if(!name)return res.status(400).json({error:'first_name is required'});
  if(name.length>150)return res.status(400).json({error:'Name is too long'});
  const normalizedPhone=normalizePhone(phone);
  const normalizedEmail=String(email||'').trim().toLowerCase()||null;
  const personType=String(type||'visitor').trim()||'visitor';
  try{
   const duplicate=normalizedPhone?await pool.query(`SELECT id,first_name,last_name FROM people WHERE organization_id=$1 AND phone=$2 AND COALESCE(status,'active')='active' LIMIT 1`,[orgId,normalizedPhone]):{rows:[]};
   if(duplicate.rows.length)return res.status(409).json({error:'A person with this phone number already exists in this organization.',duplicate:duplicate.rows[0]});
   const result=await pool.query(`INSERT INTO people(organization_id,first_name,last_name,phone,email,type,birthday,created_by,living_truth,status,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active','manual') RETURNING *`,[
    orgId,name,String(last_name||'').trim(),normalizedPhone,normalizedEmail,personType,birthday||null,req.user.id,
    JSON.stringify({status:'alive',confidence:90,source:'canonical_record',updated_at:new Date().toISOString()})
   ]);
   const person=result.rows[0];
   try{
    const event=await emitAriaEvent({
     organizationId:orgId,personId:person.id,type:'PERSON_CREATED',source:'manual',actorId:req.user.id,
     metadata:{source:'api',user:req.user.id},
     eventKey:`manual:${orgId}:person:${person.id}:created`
    });
    if(event)await processAriaEvent(event);
   }catch(err){console.error('ARIA person creation event failed:',err)}
   return res.status(201).json(person);
  }catch(err){
   console.error('POST person error:',err);
   return res.status(500).json({error:'Unable to create person.'});
  }
 }
 if(req.method==='PUT'){
  const {id,first_name,last_name,phone,email,type,birthday}=req.body||{};
  if(!id)return res.status(400).json({error:'id is required'});
  try{
   const check=await pool.query(`SELECT id FROM people WHERE id=$1 AND organization_id=$2 AND COALESCE(status,'active')='active' LIMIT 1`,[id,orgId]);
   if(!check.rows.length)return res.status(404).json({error:'Person not found'});
   const updates=[],values=[];let n=1;
   if(first_name!==undefined){
    const value=String(first_name).trim();
    if(!value)return res.status(400).json({error:'first_name cannot be empty'});
    if(value.length>150)return res.status(400).json({error:'Name is too long'});
    updates.push(`first_name=$${n++}`);values.push(value);
   }
   if(last_name!==undefined){updates.push(`last_name=$${n++}`);values.push(String(last_name||'').trim())}
   if(phone!==undefined){updates.push(`phone=$${n++}`);values.push(normalizePhone(phone)||null)}
   if(email!==undefined){updates.push(`email=$${n++}`);values.push(String(email||'').trim().toLowerCase()||null)}
   if(type!==undefined){const value=String(type||'visitor').trim()||'visitor';updates.push(`type=$${n++}`);values.push(value)}
   if(birthday!==undefined){updates.push(`birthday=$${n++}`);values.push(birthday||null)}
   if(!updates.length)return res.status(400).json({error:'No fields to update'});
   updates.push('updated_at=NOW()');
   values.push(id,orgId);
   const result=await pool.query(`UPDATE people SET ${updates.join(',')} WHERE id=$${n} AND organization_id=$${n+1} AND COALESCE(status,'active')='active' RETURNING *`,values);
   if(!result.rows.length)return res.status(404).json({error:'Person not found'});
   try{
    await emitAriaEvent({
     organizationId:orgId,personId:id,type:'PERSON_UPDATED',source:'manual',actorId:req.user.id,
     metadata:{updated_fields:Object.keys(req.body).filter(k=>k!=='id')},
     eventKey:`manual:${orgId}:person:${id}:update:${Date.now()}`
    });
   }catch(err){console.error('ARIA person update event failed:',err)}
   return res.status(200).json(result.rows[0]);
  }catch(err){
   console.error('PUT person error:',err);
   return res.status(500).json({error:'Unable to update person.'});
  }
 }
 res.setHeader('Allow','GET,POST,PUT');
 return res.status(405).json({error:'Method not allowed'});
}
export default withOrg(handler);
