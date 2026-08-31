// pages/api/attendance/mark.js
// Records attendance and permanently records the authenticated user who marked it.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req,res){
  if(req.method!=='POST')return res.status(405).end();

  const{session_id,people_id}=req.body||{};
  if(!session_id||!people_id)
    return res.status(400).json({error:'Missing session_id or people_id'});

  const orgId=req.org.id,userId=req.user.id,client=await pool.connect();

  try{
    const s=await client.query(
      `SELECT id FROM sessions WHERE id=$1 AND organization_id=$2 AND status='active' LIMIT 1`,
      [session_id,orgId]
    );
    if(!s.rows.length)
      return res.status(403).json({error:'Active session not found in your organization.'});

    const p=await client.query(
      `SELECT id FROM people WHERE id=$1 AND organization_id=$2 LIMIT 1`,
      [people_id,orgId]
    );
    if(!p.rows.length)
      return res.status(403).json({error:'Person not found in your organization.'});

    const date=new Date().toISOString().slice(0,10);

    await client.query('BEGIN');

    const existing=await client.query(
      `SELECT id FROM attendance_records
       WHERE people_id=$1 AND attendance_date=$2
       LIMIT 1`,
      [people_id,date]
    );

    if(existing.rows.length){
      await client.query(
        `UPDATE attendance_records
         SET present=true,session_id=$1,marked_by=$2,marked_at=NOW(),confirmed=false
         WHERE id=$3`,
        [session_id,userId,existing.rows[0].id]
      );
    }else{
      await client.query(
        `INSERT INTO attendance_records
         (people_id,attendance_date,present,session_id,marked_by,marked_at,confirmed)
         VALUES($1,$2,true,$3,$4,NOW(),false)`,
        [people_id,date,session_id,userId]
      );
    }

    await client.query('COMMIT');

    return res.status(200).json({success:true,marked_by:userId});
  }catch(err){
    try{await client.query('ROLLBACK')}catch{}
    console.error('[ATTENDANCE] Mark error:',err);
    return res.status(500).json({error:'Could not mark attendance.'});
  }finally{
    client.release();
  }
});
