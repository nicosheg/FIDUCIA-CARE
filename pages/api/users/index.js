// pages/api/users/index.js
import pool from '../../../lib/db';
import { getCurrentCareUser } from '../../../lib/auth';

export default async function handler(req,res){
  const user=await getCurrentCareUser(req);
  if(!user)return res.status(401).json({error:'Unauthorized'});
  if(req.method==='GET'){
    try{
      const r=await pool.query(`SELECT id,name,email,role,active,created_at,last_login_at FROM users WHERE organization_id=$1 ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,name`,[user.organization_id]);
      return res.status(200).json({users:r.rows,currentUserId:user.id,currentRole:user.role});
    }catch(e){return res.status(500).json({error:'Unable to load users.'});}
  }
  return res.status(405).json({error:'Method not allowed'});
}
