// pages/api/people/restore.js
import pool from'../../../lib/db';
import{withOrg}from'../../../lib/apiHelpers';

export default withOrg(async function handler(req,res){
if(req.method!=='POST'){
res.setHeader('Allow','POST');
return res.status(405).json({error:'Method not allowed'});
}
const{id}=req.body||{};
if(!id)return res.status(400).json({error:'Missing person id'});
const orgId=req.org.id;
try{
const check=await pool.query(`SELECT id FROM people WHERE id=$1 AND organization_id=$2 AND status='archived' LIMIT 1`,[id,orgId]);
if(!check.rows.length)return res.status(404).json({error:'Archived person not found'});
const person=(await pool.query(`UPDATE people SET status='active',updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND status='archived' RETURNING *`,[id,orgId])).rows[0];
try{
await pool.query(`INSERT INTO timeline_events(people_id,event_type,title,description,metadata,source,occurred_at,created_at) VALUES($1,'person_restored','Person restored','Person restored to the active people directory.',$2,'human',NOW(),NOW())`,[id,{actor_id:req.user.id}]);
}catch(err){console.error('Restore timeline event failed:',err)}
return res.status(200).json({success:true,person});
}catch(err){
console.error('Restore person error:',err);
return res.status(500).json({error:'Unable to restore person.'});
}
});
