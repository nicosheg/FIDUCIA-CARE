// pages/api/users/index.js
import crypto from'crypto';
import pool from'../../../lib/db';
import{withOrg}from'../../../lib/apiHelpers';

function createInvitationToken(){return crypto.randomBytes(32).toString('hex')}
function hashInvitationToken(token){return crypto.createHash('sha256').update(token).digest('hex')}
function getAppUrl(req){return(process.env.NEXT_PUBLIC_SITE_URL||process.env.NEXT_PUBLIC_APP_URL||`${req.headers['x-forwarded-proto']||'https'}://${req.headers.host}`).replace(/\/$/,'')}

export default withOrg(async function handler(req,res){
  const orgId=req.org.id;
  const currentUser=req.user;

  if(req.method==='GET'){
    try{
      const result=await pool.query(`SELECT id,email,name,role,active,created_at,updated_at,last_login_at FROM users WHERE organization_id=$1 ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,created_at ASC`,[orgId]);
      return res.status(200).json({users:result.rows});
    }catch(err){
      console.error('[USERS] Error listing users:',err);
      return res.status(500).json({error:'Unable to load organization members.'});
    }
  }

  if(req.method==='POST'){
    if(!['owner','admin'].includes(currentUser.role))return res.status(403).json({error:'Only owners and admins can invite people.'});
    const{name,role}=req.body||{};
    const cleanName=typeof name==='string'?name.trim():'';
    if(!cleanName)return res.status(400).json({error:'Please provide the person’s name.'});
    if(cleanName.length>120)return res.status(400).json({error:'Name is too long.'});
    if(!['admin','user'].includes(role))return res.status(400).json({error:'Invalid invitation role.'});
    const token=createInvitationToken(),tokenHash=hashInvitationToken(token);
    try{
      await pool.query(`UPDATE invitations SET revoked_at=now() WHERE organization_id=$1 AND lower(name)=lower($2) AND accepted_at IS NULL AND revoked_at IS NULL`,[orgId,cleanName]);
      const result=await pool.query(`INSERT INTO invitations(organization_id,token_hash,name,role,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,name,role,created_at,expires_at`,[orgId,tokenHash,cleanName,role,currentUser.id]);
      const invitation=result.rows[0];
      return res.status(201).json({invitation:{...invitation,url:`${getAppUrl(req)}/join?token=${encodeURIComponent(token)}`}});
    }catch(err){
      console.error('[USERS] Error creating invitation:',err);
      return res.status(500).json({error:'Unable to create invitation.'});
    }
  }

  return res.status(405).end();
});
