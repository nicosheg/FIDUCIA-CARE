// pages/api/profile.js
import crypto from 'crypto';
import pool from '../../lib/db';
import { withOrg } from '../../lib/apiHelpers';

function hashToken(token){return crypto.createHash('sha256').update(token).digest('hex');}
function clean(value,max=200){return typeof value==='string'?value.trim().slice(0,max):'';}

async function handler(req,res){
  const user=req.user;
  const orgId=req.org.id;

  if(req.method==='GET'){
    try{
      const [users,org]=await Promise.all([
        pool.query(`SELECT id,email,name,role,created_at,updated_at FROM users WHERE organization_id=$1 ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,created_at`,[orgId]),
        pool.query(`SELECT id,name,settings,aria_instructions FROM organizations WHERE id=$1 LIMIT 1`,[orgId])
      ]);
      if(!org.rows.length)return res.status(404).json({error:'Organization not found'});
      return res.status(200).json({
        user:{id:user.id,email:user.email,name:user.name,role:user.role,created_at:user.created_at,updated_at:user.updated_at},
        organization:{id:org.rows[0].id,name:org.rows[0].name,status:'active',ariaInstructions:org.rows[0].aria_instructions||''},
        users:users.rows
      });
    }catch(err){
      console.error('[PROFILE] GET error:',err);
      return res.status(500).json({error:'Unable to load profile'});
    }
  }

  if(req.method==='PATCH'){
    const {action,name,organizationName,ariaInstructions}=req.body||{};
    try{
      if(action==='personal'){
        const nextName=clean(name,120);
        if(!nextName)return res.status(400).json({error:'Name is required'});
        const result=await pool.query(`UPDATE users SET name=$1,updated_at=NOW() WHERE id=$2 AND organization_id=$3 RETURNING id,email,name,role,created_at,updated_at`,[nextName,user.id,orgId]);
        return res.status(200).json({user:result.rows[0]});
      }

      if(action==='organization'){
        if(user.role!=='owner')return res.status(403).json({error:'Only the organization owner can change the organization name.'});
        const nextName=clean(organizationName,160);
        if(!nextName)return res.status(400).json({error:'Organization name is required'});
        const result=await pool.query(`UPDATE organizations SET name=$1,updated_at=NOW() WHERE id=$2 RETURNING id,name`,[nextName,orgId]);
        return res.status(200).json({organization:result.rows[0]});
      }

      if(action==='aria'){
        if(typeof ariaInstructions!=='string')return res.status(400).json({error:'ARIA instructions must be text'});
        const cleaned=ariaInstructions.trim();
        if(cleaned.length>2000)return res.status(400).json({error:'ARIA instructions must be 2000 characters or less'});
        await pool.query(`UPDATE organizations SET aria_instructions=$1,updated_at=NOW() WHERE id=$2`,[cleaned||null,orgId]);
        return res.status(200).json({ariaInstructions:cleaned});
      }

      return res.status(400).json({error:'Unknown profile action'});
    }catch(err){
      console.error('[PROFILE] PATCH error:',err);
      return res.status(500).json({error:'Unable to update profile'});
    }
  }

  if(req.method==='POST'){
    const {action,email,role}=req.body||{};
    if(action!=='create_invite')return res.status(400).json({error:'Unknown profile action'});
    if(!['owner','admin','user'].includes(role))return res.status(400).json({error:'Invalid role'});
    if(user.role==='user')return res.status(403).json({error:'Only owners and admins can invite users.'});
    if(role==='owner'&&user.role!=='owner')return res.status(403).json({error:'Only the organization owner can invite an owner.'});

    const inviteEmail=clean(email,320).toLowerCase();
    if(!inviteEmail||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail))return res.status(400).json({error:'Enter a valid email address.'});

    try{
      const existing=await pool.query(`SELECT id FROM users WHERE organization_id=$1 AND LOWER(email)=LOWER($2) LIMIT 1`,[orgId,inviteEmail]);
      if(existing.rows.length)return res.status(400).json({error:'This email already has access to the organization.'});

      const pending=await pool.query(`SELECT id FROM organization_invites WHERE organization_id=$1 AND LOWER(email)=LOWER($2) AND used_at IS NULL AND expires_at>NOW() LIMIT 1`,[orgId,inviteEmail]);
      if(pending.rows.length)return res.status(400).json({error:'An active invitation already exists for this email.'});

      const token=crypto.randomBytes(32).toString('hex');
      const tokenHash=hashToken(token);
      const expiresAt=new Date(Date.now()+48*60*60*1000);

      await pool.query(`INSERT INTO organization_invites(organization_id,invited_by,email,role,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)`,[orgId,user.id,inviteEmail,role,tokenHash,expiresAt]);

      const origin=process.env.NEXT_PUBLIC_SITE_URL||`${req.headers['x-forwarded-proto']||'https'}://${req.headers.host}`;
      return res.status(201).json({success:true,inviteUrl:`${origin.replace(/\/$/,'')}/join?token=${token}`,expiresAt});
    }catch(err){
      console.error('[PROFILE] Invite error:',err);
      return res.status(500).json({error:'Unable to create invitation'});
    }
  }

  res.status(405).json({error:'Method not allowed'});
}

export default withOrg(handler);
