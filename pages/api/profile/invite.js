// pages/api/profile/invite.js
import crypto from 'crypto';
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

function hashToken(token){return crypto.createHash('sha256').update(token).digest('hex');}

async function handler(req,res){
  const token=typeof req.body?.token==='string'?req.body.token.trim():typeof req.query.token==='string'?req.query.token.trim():'';
  if(!token)return res.status(400).json({error:'Invitation token is required'});

  if(req.method==='GET'){
    try{
      const result=await pool.query(`SELECT i.email,i.role,i.expires_at,o.name AS organization_name FROM organization_invites i INNER JOIN organizations o ON o.id=i.organization_id WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.expires_at>NOW() LIMIT 1`,[hashToken(token)]);
      if(!result.rows.length)return res.status(410).json({error:'This invitation is invalid, expired, or already used.'});
      return res.status(200).json({valid:true,...result.rows[0]});
    }catch(err){
      console.error('[INVITE] GET error:',err);
      return res.status(500).json({error:'Unable to verify invitation'});
    }
  }

  return res.status(405).json({error:'Method not allowed'});
}

async function acceptHandler(req,res){
  const token=typeof req.body?.token==='string'?req.body.token.trim():'';
  if(!token)return res.status(400).json({error:'Invitation token is required'});

  try{
    const invite=await pool.query(`SELECT id,organization_id,email,role,expires_at FROM organization_invites WHERE token_hash=$1 AND used_at IS NULL AND expires_at>NOW() FOR UPDATE`,[hashToken(token)]);
    if(!invite.rows.length)return res.status(410).json({error:'This invitation is invalid, expired, or already used.'});

    const target=invite.rows[0];
    const currentEmail=req.user.email||'';

    if(target.email&&target.email.toLowerCase()!==currentEmail.toLowerCase())return res.status(403).json({error:`This invitation was created for ${target.email}. Please sign in with that email.`});

    const existing=await pool.query(`SELECT id,organization_id FROM users WHERE supabase_user_id=$1 LIMIT 1`,[req.user.supabase_user_id]);
    if(existing.rows.length&&existing.rows[0].organization_id!==target.organization_id)return res.status(409).json({error:'Your account already belongs to another organization.'});

    const existingTarget=await pool.query(`SELECT id FROM users WHERE organization_id=$1 AND LOWER(email)=LOWER($2) LIMIT 1`,[target.organization_id,currentEmail]);
    let userId;

    if(existingTarget.rows.length){
      userId=existingTarget.rows[0].id;
      await pool.query(`UPDATE users SET role=$1,supabase_user_id=$2,updated_at=NOW() WHERE id=$3 AND organization_id=$4`,[target.role,req.user.supabase_user_id,userId,target.organization_id]);
    }else{
      const created=await pool.query(`INSERT INTO users(organization_id,email,name,role,supabase_user_id) VALUES($1,$2,$3,$4,$5) RETURNING id`,[target.organization_id,currentEmail,req.user.user_metadata?.name||req.user.user_metadata?.full_name||currentEmail.split('@')[0],target.role,req.user.supabase_user_id]);
      userId=created.rows[0].id;
    }

    const consumed=await pool.query(`UPDATE organization_invites SET used_at=NOW(),accepted_by=$1 WHERE id=$2 AND used_at IS NULL RETURNING id`,[userId,target.id]);
    if(!consumed.rows.length)return res.status(409).json({error:'This invitation has already been used.'});

    return res.status(200).json({success:true,organizationId:target.organization_id,role:target.role});
  }catch(err){
    console.error('[INVITE] Accept error:',err);
    return res.status(500).json({error:'Unable to accept invitation'});
  }
}

export default async function route(req,res){
  if(req.method==='POST'){
    const token=typeof req.body?.token==='string'?req.body.token.trim():'';
    if(!token)return res.status(400).json({error:'Invitation token is required'});
    const { getAuthUser }=await import('../../../lib/auth');
    const authUser=await getAuthUser(req);
    if(!authUser)return res.status(401).json({error:'Please sign in or create your account before accepting this invitation.'});
    req.user=authUser;
    return acceptHandler(req,res);
  }
  return handler(req,res);
}
