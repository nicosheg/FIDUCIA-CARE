// pages/api/attendance/people.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req,res){
 if(req.method!=='GET')return res.status(405).end();

 const{session_id}=req.query;
 if(!session_id)return res.status(400).json({error:'session_id required'});

 try{
  const r=await pool.query(
   `SELECT p.id,p.first_name,p.last_name,p.phone,
           COALESCE(ar.present,false) AS marked,
           COALESCE(
             NULLIF(au.raw_user_meta_data->>'name',''),
             NULLIF(CONCAT_WS(' ',au.raw_user_meta_data->>'first_name',au.raw_user_meta_data->>'last_name'),''),
             au.email
           ) AS marked_by_name
    FROM people p
    LEFT JOIN attendance_records ar
      ON ar.people_id=p.id
     AND ar.session_id=$1
     AND ar.attendance_date=CURRENT_DATE
    LEFT JOIN auth.users au ON au.id=ar.marked_by
    WHERE p.organization_id=$2
      AND COALESCE(p.status,'active')='active'
    ORDER BY p.first_name,p.last_name`,
   [session_id,req.org.id]
  );

  return res.status(200).json(r.rows);
 }catch(err){
  console.error('[ATTENDANCE] People error:',err);
  return res.status(500).json({error:'Could not load people.'});
 }
});
