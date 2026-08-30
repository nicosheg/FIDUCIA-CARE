// pages/api/attendance/create-session.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

async function handler(req,res){
 if(req.method!=='POST')return res.status(405).end();

 const{name}=req.body||{};
 if(typeof name!=='string'||!name.trim())return res.status(400).json({error:'Session name required'});

 const orgId=req.org.id,userId=req.user.id,client=await pool.connect();

 try{
  await client.query('BEGIN');

  // Create the named event/session.
  const s=await client.query(
   `INSERT INTO sessions(organization_id,name,status) VALUES($1,$2,'active') RETURNING id,name`,
   [orgId,name.trim()]
  );
  const session=s.rows[0];

  // The creator is automatically assigned so they can mark attendance.
  await client.query(
   `INSERT INTO session_users(session_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
   [session.id,userId]
  );

  // Attach all organization attendance groups when they exist.
  const g=await client.query(
   `SELECT id FROM attendance_groups WHERE organization_id=$1 ORDER BY sort_order`,
   [orgId]
  );

  for(const row of g.rows){
   await client.query(
    `INSERT INTO session_groups(session_id,group_id) VALUES($1,$2) ON CONFLICT DO NOTHING`,
    [session.id,row.id]
   );
  }

  await client.query('COMMIT');
  return res.status(200).json({id:session.id,name:session.name});
 }catch(err){
  try{await client.query('ROLLBACK')}catch{}
  console.error('[ATTENDANCE] Create session error:',err);
  return res.status(500).json({error:'Could not create attendance session.'});
 }finally{client.release()}
}

export default withOrg(handler);
