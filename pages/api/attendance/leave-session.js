// pages/api/attendance/leave-session.js
// FIDUCIA CARE — Discard/reverse an active attendance session.
// Only the session creator can discard it.
// Live attendance and session relationships are removed.
// Historical/closed sessions cannot be discarded through this endpoint.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req,res){
 if(req.method!=='POST'){
  res.setHeader('Allow','POST');
  return res.status(405).json({error:'Method not allowed'});
 }

 const{session_id}=req.body||{};
 if(!session_id)return res.status(400).json({error:'session_id is required.'});

 const orgId=req.org.id,userId=req.user.id,client=await pool.connect();

 try{
  await client.query('BEGIN');

  // Lock the active session so two destructive actions cannot race.
  const session=await client.query(
   `SELECT id,name,started_by,status
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

  const row=session.rows[0];

  if(row.status!=='active'){
   await client.query('ROLLBACK');
   return res.status(409).json({error:'This attendance session is already closed.'});
  }

  // Only the person who created the session can discard it.
  if(row.started_by!==userId){
   await client.query('ROLLBACK');
   return res.status(403).json({error:'Only the session creator can leave and discard this session.'});
  }

  // Remove live attendance first, then session relationships.
  await client.query(
   `DELETE FROM attendance_records
    WHERE organization_id=$1 AND session_id=$2`,
   [orgId,session_id]
  );

  await client.query(`DELETE FROM session_groups WHERE session_id=$1`,[session_id]);
  await client.query(`DELETE FROM session_sections WHERE session_id=$1`,[session_id]);
  await client.query(`DELETE FROM session_users WHERE session_id=$1`,[session_id]);
  await client.query(
   `DELETE FROM sessions
    WHERE id=$1 AND organization_id=$2 AND status='active'`,
   [session_id,orgId]
  );

  await client.query('COMMIT');

  return res.status(200).json({
   success:true,
   discarded:true,
   session_id,
  });
 }catch(err){
  try{await client.query('ROLLBACK')}catch{}
  console.error('[ATTENDANCE] Leave session error:',err);
  return res.status(500).json({error:'Could not leave this attendance session.'});
 }finally{client.release()}
});
