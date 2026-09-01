// pages/api/invites/[token].js
import crypto from 'crypto';
import pool from '../../../lib/db';

const hash=t=>crypto.createHash('sha256').update(t).digest('hex');

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const token=String(req.query.token||'');
  if(!token)return res.status(400).json({error:'Invalid invitation.'});
  try{
    const r=await pool.query(`SELECT o.name organization_name,i.role,i.expires_at FROM organization_invites i JOIN organizations o ON o.id=i.organization_id WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.expires_at>now() LIMIT 1`,[hash(token)]);
    if(!r.rows.length)return res.status(410).json({error:'This invitation has expired, been used, or is no longer available.'});
    return res.status(200).json(r.rows[0]);
  }catch(e){return res.status(500).json({error:'Unable to open invitation.'});}
}
