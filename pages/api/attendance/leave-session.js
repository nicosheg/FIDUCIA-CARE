// pages/api/attendance/leave-session.js
// FIDUCIA CARE — Admin/Owner-only active-session discard endpoint.

import pool from '../../../lib/db';
import { withAdmin } from '../../../lib/apiHelpers';

export default withAdmin(async function handler(req,res){
 if(req.method!=='POST'){
  res.setHeader('Allow','POST');
  return res.status(405).json({error:'Method not allowed'});
 }

 const{session_id}=req.body||{};
 if(!session_id)return res.status(400).json({error:'session_id is required.'});

 const orgId=req.org.id,userId=req.user.id,client=await pool.connect();

 try{
  await client.query('BEGIN');

  const session=await client.query(
   `SELECT id,name,status
    FROM sessions
    WHERE id=$1 AND organization_id=$2
    LIMIT 1
    FOR UPDATE`,
   [session_id,orgId]
  );

  if(!session.rows.length){
   await client.query('ROLLBACK');
   return res.status(404).json({error:'Attendance session not found.'});
  }

  if(session.rows[0].status!=='active'){
   await client.query('ROLLBACK');
   return res.status(409).json({error:'This attendance session is no longer active.'});
  }

  await client.query(
   `DELETE FROM attendance_records
    WHERE organization_id=$1 AND session_id=$2`,
   [orgId,session_id]
  );

  await client.query(
   `DELETE FROM session_users
    WHERE session_id=$1`,
   [session_id]
  );

  const deleted=await client.query(
   `DELETE FROM sessions
    WHERE id=$1 AND organization_id=$2 AND status='active'
    RETURNING id,name`,
   [session_id,orgId]
  );

  await client.query('COMMIT');

  return res.status(200).json({
   success:true,
   discarded:true,
   session:deleted.rows[0],
   discarded_by:userId
  });
 }catch(err){
  try{await client.query('ROLLBACK')}catch{}
  console.error('[ATTENDANCE] Leave session error:',err);
  return res.status(500).json({error:'Could not discard this attendance session.'});
 }finally{
  client.release();
 }
});
