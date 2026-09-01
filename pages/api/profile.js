// pages/api/profile.js
import pool from '../../lib/db';
import {withOrg} from '../../lib/apiHelpers';

async function handler(req,res){
  const user=req.user;
  const org=req.org;

  if(req.method==='GET'){
    return res.status(200).json({
      id:user.id,
      email:user.email,
      name:user.name,
      role:user.role,
      created_at:user.created_at,
      updated_at:user.updated_at,
      organization:{id:org.id,name:org.name}
    });
  }

  if(req.method==='PUT'){
    const name=typeof req.body?.name==='string'?req.body.name.trim():'';

    if(!name)return res.status(400).json({error:'Name is required'});
    if(name.length>120)return res.status(400).json({error:'Name is too long'});

    try{
      const result=await pool.query(
        `UPDATE users SET name=$1,updated_at=NOW() WHERE id=$2 AND organization_id=$3 RETURNING id,email,name,role,created_at,updated_at`,
        [name,user.id,org.id]
      );

      if(!result.rows.length)return res.status(404).json({error:'Profile not found'});

      return res.status(200).json({
        ...result.rows[0],
        organization:{id:org.id,name:org.name}
      });
    }catch(err){
      console.error('[PROFILE] Update error:',err);
      return res.status(500).json({error:'Unable to update profile'});
    }
  }

  return res.status(405).json({error:'Method not allowed'});
}

export default withOrg(handler);
