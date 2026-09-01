// pages/api/users/[id].js
import pool from '../../../lib/db';
import { getCurrentCareUser } from '../../../lib/auth';

export default async function handler(req,res){
  const actor=await getCurrentCareUser(req);
  if(!actor)return res.status(401).json({error:'Unauthorized'});
  const id=req.query.id;
  try{
    const target=await pool.query(`SELECT id,name,email,role,active FROM users WHERE id=$1 AND organization_id=$2`,[id,actor.organization_id]);
    if(!target.rows.length)return res.status(404).json({error:'User not found.'});
    const t=target.rows[0];

    if(req.method==='PATCH'){
      if(actor.role!=='owner')return res.status(403).json({error:'Only the owner can change responsibilities.'});
      const role=req.body?.role;
      if(!['admin','user'].includes(role))return res.status(400).json({error:'Invalid responsibility.'});
      if(t.role==='owner')return res.status(400).json({error:'Ownership must be transferred, not reassigned here.'});
      await pool.query(`UPDATE users SET role=$1,updated_at=now() WHERE id=$2 AND organization_id=$3`,[role,id,actor.organization_id]);
      return res.status(200).json({success:true});
    }

    if(req.method==='DELETE'){
      if(actor.role!=='owner'&&actor.role!=='admin')return res.status(403).json({error:'You do not have permission to remove users.'});
      if(t.id===actor.id)return res.status(400).json({error:'You cannot remove yourself.'});
      if(t.role==='owner')return res.status(403).json({error:'Ownership must be transferred before the owner can leave.'});
      await pool.query(`UPDATE users SET active=false,updated_at=now() WHERE id=$1 AND organization_id=$2`,[id,actor.organization_id]);
      return res.status(200).json({success:true});
    }

    if(req.method==='POST'&&req.body?.action==='transfer_ownership'){
      if(actor.role!=='owner')return res.status(403).json({error:'Only the owner can transfer ownership.'});
      if(t.id===actor.id)return res.status(400).json({error:'Choose another user.'});
      if(!t.active)return res.status(400).json({error:'That user is inactive.'});
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query(`UPDATE users SET role='admin',updated_at=now() WHERE id=$1 AND organization_id=$2`,[actor.id,actor.organization_id]);
        await client.query(`UPDATE users SET role='owner',updated_at=now() WHERE id=$1 AND organization_id=$2`,[id,actor.organization_id]);
        await client.query('COMMIT');
        return res.status(200).json({success:true});
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release();}
    }

    return res.status(405).json({error:'Method not allowed'});
  }catch(error){
    console.error('[USER]',error);
    return res.status(500).json({error:'Unable to update user.'});
  }
}
