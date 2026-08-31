// pages/api/attendance/mark.js
// Canonical attendance endpoint.
// Records the registered user who marked each person.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req,res){
  if(req.method!=='POST')return res.status(405).end();

  const{session_id,people_id}=req.body||{};
  if(!session_id||!people_id)
    return res.status(400).json({error:'Missing session_id or people_id'});

  const orgId=req.org.id;
  const userId=req.user.id;
  const client=await pool.connect();

  try{
    const session=await client.query(
      `SELECT id FROM sessions
       WHERE id=$1 AND organization_id=$2 AND status='active'
       LIMIT 1`,
      [session_id,orgId]
    );
    if(!session.rows.length)
      return res.status(403).json({error:'Active session not found in your organization.'});

    const person=await client.query(
      `SELECT id FROM people
       WHERE id=$1 AND organization_id=$2
       LIMIT 1`,
      [people_id,orgId]
    );
    if(!person.rows.length)
      return res.status(403).json({error:'Person not found in your organization.'});

    const today=new Date().toISOString().slice(0,10);

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO attendance_records
       (people_id,attendance_date,present,session_id,marked_by,marked_at,confirmed)
       VALUES($1,$2,true,$3,$4,NOW(),false)
       ON CONFLICT(people_id,attendance_date) DO UPDATE SET
       present=true,session_id=EXCLUDED.session_id,
       marked_by=EXCLUDED.marked_by,marked_at=NOW(),confirmed=false`,
      [people_id,today,session_id,userId]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success:true,
      marked_by:userId
    });
  }catch(err){
    try{await client.query('ROLLBACK')}catch{}
    console.error('[ATTENDANCE] Mark error:',err);
    return res.status(500).json({error:'Could not mark attendance.'});
  }finally{
    client.release();
  }
});
