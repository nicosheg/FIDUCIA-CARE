// pages/api/users/invite.js
import crypto from 'crypto';
import pool from '../../../lib/db';
import {getCurrentCareUser} from '../../../lib/auth';

const hash=t=>crypto.createHash('sha256').update(t).digest('hex');

function appUrl(req){
  return(process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_SITE_URL||`${req.headers['x-forwarded-proto']||'https'}://${req.headers.host}`).replace(/\/$/,'');
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  const user=await getCurrentCareUser(req);
  if(!user)return res.status(401).json({error:'Unauthorized'});
  if(!['owner','admin'].includes(user.role))return res.status(403).json({error:'Only owners and admins can invite users.'});

  const role=req.body?.role;
  if(!['admin','user'].includes(role))return res.status(400).json({error:'Invalid responsibility.'});

  try{
    const token=crypto.randomBytes(32).toString('hex');
    const tokenHash=hash(token);
    const expires=new Date(Date.now()+48*60*60*1000);

    await pool.query(
      `INSERT INTO organization_invites
       (organization_id,invited_by,email,role,token_hash,expires_at)
       VALUES($1,$2,$3,$4,$5,$6)`,
      [user.organization_id,user.id,null,role,tokenHash,expires]
    );

    return res.status(200).json({
      success:true,
      role,
      expires_at:expires.toISOString(),
      url:`${appUrl(req)}/join/${token}`
    });
  }catch(error){
    console.error('[INVITE]',error);
    return res.status(500).json({error:'Unable to create invitation.'});
  }
                                                                               }
