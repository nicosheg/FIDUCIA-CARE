// pages/api/profile.js
import pool from '../../lib/db';
import {getCurrentCareUser} from '../../lib/auth';

export default async function handler(req,res){
const user=await getCurrentCareUser(req);
if(!user)return res.status(401).json({error:'Unauthorized'});
if(req.method==='GET'){
try{
const r=await pool.query(`SELECT id,name,aria_instructions FROM organizations WHERE id=$1`,[user.organization_id]);
if(!r.rows.length)return res.status(404).json({error:'Organization not found.'});
return res.status(200).json({user:{id:user.id,name:user.name,email:user.email,role:user.role,active:user.active,last_login_at:user.last_login_at},organization:r.rows[0]});
}catch(e){return res.status(500).json({error:'Unable to load profile.'})}
}
if(req.method==='PATCH'){
const{name,ariaInstructions,userName}=req.body||{};
if(userName!==undefined){
const cleaned=String(userName||'').trim();
if(!cleaned||cleaned.length>120)return res.status(400).json({error:'Your name must be between 1 and 120 characters.'});
try{
const r=await pool.query(`UPDATE users SET name=$1,updated_at=now() WHERE id=$2 AND organization_id=$3 AND active=true RETURNING id,name,email,role,active,last_login_at`,[cleaned,user.id,user.organization_id]);
if(!r.rows.length)return res.status(404).json({error:'Unable to update your name.'});
return res.status(200).json({success:true,user:r.rows[0]});
}catch(e){return res.status(500).json({error:'Unable to update your name.'})}
}
if(name!==undefined&&user.role!=='owner')return res.status(403).json({error:'Only the owner can change the organization name.'});
if(ariaInstructions!==undefined&&!['owner','admin'].includes(user.role))return res.status(403).json({error:'Only owners and admins can edit ARIA organization knowledge.'});
try{
if(name!==undefined){
const cleaned=String(name||'').trim();
if(!cleaned||cleaned.length>120)return res.status(400).json({error:'Organization name must be between 1 and 120 characters.'});
await pool.query(`UPDATE organizations SET name=$1,updated_at=now() WHERE id=$2`,[cleaned,user.organization_id]);
}
if(ariaInstructions!==undefined){
const cleaned=String(ariaInstructions||'').trim();
if(cleaned.length>2000)return res.status(400).json({error:'ARIA knowledge must be 2000 characters or less.'});
await pool.query(`UPDATE organizations SET aria_instructions=$1,updated_at=now() WHERE id=$2`,[cleaned||null,user.organization_id]);
}
const[r,u]=await Promise.all([
pool.query(`SELECT id,name,aria_instructions FROM organizations WHERE id=$1`,[user.organization_id]),
pool.query(`SELECT id,name,email,role,active,last_login_at FROM users WHERE id=$1`,[user.id])
]);
return res.status(200).json({success:true,user:u.rows[0],organization:r.rows[0]});
}catch(e){return res.status(500).json({error:'Unable to save changes.'})}
}
return res.status(405).json({error:'Method not allowed.'});
                             }
