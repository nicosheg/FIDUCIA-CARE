
// pages/api/users/join.js
import crypto from 'crypto';
import pool from '../../../lib/db';
import { getAuthUser } from '../../../lib/auth';

const hash=t=>crypto.createHash('sha256').update(t).digest('hex');

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const authUser=await getAuthUser(req);
  if(!authUser)return res.status(401).json({error:'Please sign in or create your account first.'});
  const token=String(req.body?.token||'').trim();
  if(!token)return res.status(400).json({error:'Invitation link is invalid.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const invite=await client.query(`SELECT i.*,o.name organization_name FROM organization_invites i JOIN organizations o ON o.id=i.organization_id WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.expires_at>now() FOR UPDATE`,[hash(token)]);
    if(!invite.rows.length){await client.query('ROLLBACK');return res.status(410).json({error:'This invitation has expired, been used, or is no longer available.'});}
    const i=invite.rows[0];
    const existing=await client.query(`SELECT id,organization_id FROM users WHERE supabase_user_id=$1`,[authUser.id]);
    if(existing.rows.length){
      if(existing.rows[0].organization_id===i.organization_id){
        await client.query('UPDATE organization_invites SET used_at=now(),used_by=$1 WHERE id=$2',[existing.rows[0].id,i.id]);
        await client.query('COMMIT');
        return res.status(200).json({success:true,alreadyMember:true,organization_name:i.organization_name});
      }
      await client.query('ROLLBACK');
      return res.status(409).json({error:'This account already belongs to another organization.'});
    }
    const name=authUser.user_metadata?.name||authUser.user_metadata?.full_name||authUser.email?.split('@')[0]||'User';
    const email=authUser.email||'';
    const inserted=await client.query(`INSERT INTO users(supabase_user_id,email,name,role,organization_id,password_hash) VALUES($1,$2,$3,$4,$5,'supabase_managed') RETURNING id,name,role`,[authUser.id,email,name,i.role,i.organization_id]);
    await client.query(`UPDATE organization_invites SET used_at=now(),used_by=$1 WHERE id=$2`,[inserted.rows[0].id,i.id]);
    await client.query('COMMIT');
    return res.status(200).json({success:true,organization_name:i.organization_name,user:inserted.rows[0]});
  }catch(error){
    await client.query('ROLLBACK');
    console.error('[JOIN]',error);
    return res.status(500).json({error:'Unable to join the organization.'});
  }finally{client.release();}
}
