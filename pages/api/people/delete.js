// pages/api/people/delete.js
import pool from'../../../lib/db';
import{withAdmin}from'../../../lib/apiHelpers';

export default withAdmin(async function handler(req,res){
if(req.method!=='POST'){
res.setHeader('Allow','POST');
return res.status(405).json({error:'Method not allowed'});
}
const{id,ids}=req.body||{};
let deleteIds=Array.isArray(ids)?ids.filter(Boolean):id?[id]:[];
deleteIds=[...new Set(deleteIds)];
if(!deleteIds.length)return res.status(400).json({error:'Missing id or ids'});
if(deleteIds.length>500)return res.status(400).json({error:'Too many people selected.'});
const orgId=req.org.id,client=await pool.connect();
try{
await client.query('BEGIN');
const existing=await client.query(`SELECT id FROM people WHERE organization_id=$1 AND id=ANY($2) AND COALESCE(status,'active')='active'`,[orgId,deleteIds]);
const existingIds=existing.rows.map(r=>r.id);
const notFoundIds=deleteIds.filter(id=>!existingIds.includes(id));
if(!existingIds.length){
await client.query('ROLLBACK');
return res.status(404).json({success:false,error:'No matching active people found.',requested:deleteIds.length,deleted:0,deleted_ids:[],not_found_ids:notFoundIds});
}
const archived=await client.query(`UPDATE people SET status='archived',updated_at=NOW() WHERE organization_id=$1 AND id=ANY($2) AND COALESCE(status,'active')='active' RETURNING id`,[orgId,existingIds]);
const archivedIds=archived.rows.map(r=>r.id);
for(const personId of archivedIds){
try{
await client.query(`INSERT INTO timeline_events(people_id,event_type,title,description,metadata,source,occurred_at,created_at) VALUES($1,'person_archived','Person archived','Person archived by an administrator.',$2,'human',NOW(),NOW())`,[personId,{actor_id:req.user.id}]);
}catch(err){console.error('Archive timeline event failed:',err)}
}
await client.query('COMMIT');
return res.status(200).json({success:true,requested:deleteIds.length,deleted:archivedIds.length,deleted_ids:archivedIds,archived_ids:archivedIds,not_found_ids:notFoundIds});
}catch(err){
try{await client.query('ROLLBACK')}catch{}
console.error('Archive people error:',err);
return res.status(500).json({success:false,error:'Unable to remove people.',requested:deleteIds.length,deleted:0,deleted_ids:[],archived_ids:[],not_found_ids:deleteIds});
}finally{client.release()}
});
