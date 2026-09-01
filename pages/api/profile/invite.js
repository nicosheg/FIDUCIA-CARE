// pages/api/profile/invite.js
import crypto from'crypto';
import pool from'../../../lib/db';

const hashToken=t=>crypto.createHash('sha256').update(t).digest('hex');

export default async function handler(req,res){
const token=typeof req.body?.token==='string'?req.body.token.trim():typeof req.query.token==='string'?req.query.token.trim():'';
if(!token)return res.status(400).json({error:'Invitation token is required'});
if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
try{
const result=await pool.query('SELECT i.email,i.role,i.expires_at,o.name AS organization_name FROM organization_invites i JOIN organizations o ON o.id=i.organization_id WHERE i.token_hash=$1 AND i.used_at IS NULL AND i.expires_at>NOW() LIMIT 1',[hashToken(token)]);
if(!result.rows.length)return res.status(410).json({error:'This invitation is invalid, expired, or already used.'});
return res.status(200).json({valid:true,...result.rows[0]});
}catch(error){
console.error('[INVITE VERIFY]',error);
return res.status(500).json({error:'Unable to verify invitation.'});
}
                  }
