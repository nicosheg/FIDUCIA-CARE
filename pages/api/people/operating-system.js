// pages/api/people/operating-system.js
import pool from '../../../lib/db';
import{withOrg}from '../../../lib/apiHelpers';
import{getPerson360,getGroups,getLifecycleStages,getFieldDefinitions,transitionLifecycle,addTimelineEvent}from '../../../lib/peopleOperatingSystem';

const allowed=['relationship','membership','role','field','document','task','communication','group','field_definition','lifecycle_stage','view','segment','segment_member','lifecycle','note','bulk'];
const tables={document:'person_documents',task:'person_tasks',communication:'person_communications'};

async function personExists(orgId,id){
return!!(await pool.query(`SELECT 1 FROM people WHERE organization_id=$1 AND id=$2 LIMIT 1`,[orgId,id])).rows.length;
}

async function rowExists(orgId,table,id){
return!!(await pool.query(`SELECT 1 FROM ${table} WHERE organization_id=$1 AND id=$2 LIMIT 1`,[orgId,id])).rows.length;
}

const json=(v,fallback={})=>v&&typeof v==='object'&&!Array.isArray(v)?v:fallback;
const value=(v,fallback=null)=>v===undefined?fallback:v;

function resourceData(resource,b){
const metadata=json(b.metadata);
if(resource==='document')return{name:value(b.name),document_type:value(b.document_type,'record'),storage_path:value(b.storage_path),document_url:value(b.document_url!==undefined?b.document_url:b.url),issued_at:value(b.issued_at),expires_at:value(b.expires_at),metadata};
if(resource==='task')return{title:value(b.title),description:value(b.description),status:value(b.status,'open'),priority:value(b.priority,'medium'),due_at:value(b.due_at!==undefined?b.due_at:b.due_date),completed_at:value(b.completed_at),assigned_to:value(b.assigned_to),metadata};
return{channel:value(b.channel,'whatsapp'),direction:value(b.direction,'outbound'),status:value(b.status,'draft'),subject:value(b.subject),content:value(b.content!==undefined?b.content:b.body),external_id:value(b.external_id),occurred_at:value(b.occurred_at),metadata};
}

async function handler(req,res){
const orgId=req.org.id;
if(req.method==='GET'){
try{
const resource=String(req.query.resource||'profile');
if(resource==='profile'){
if(!req.query.person_id)return res.status(400).json({error:'person_id is required'});
const data=await getPerson360(orgId,String(req.query.person_id));
return data?res.status(200).json(data):res.status(404).json({error:'Person not found'});
}
if(resource==='groups')return res.status(200).json(await getGroups(orgId,{type:req.query.type,active:req.query.active}));
if(resource==='lifecycle-stages')return res.status(200).json(await getLifecycleStages(orgId));
if(resource==='field-definitions')return res.status(200).json(await getFieldDefinitions(orgId));
if(resource==='views')return res.status(200).json((await pool.query(`SELECT * FROM person_views WHERE organization_id=$1 AND(shared=true OR created_by=$2) ORDER BY name`,[orgId,req.user.id])).rows);
if(resource==='segments')return res.status(200).json((await pool.query(`SELECT * FROM person_segments WHERE organization_id=$1 AND active=true ORDER BY name`,[orgId])).rows);
if(resource==='group-members'){
if(!req.query.group_id)return res.status(400).json({error:'group_id is required'});
return res.status(200).json((await pool.query(`SELECT m.*,p.first_name,p.last_name,p.display_name,p.phone,p.email,p.type,p.status FROM person_memberships m JOIN people p ON p.organization_id=m.organization_id AND p.id=m.person_id WHERE m.organization_id=$1 AND m.group_id=$2 ORDER BY COALESCE(NULLIF(p.display_name,''),NULLIF(TRIM(CONCAT_WS(' ',p.first_name,p.last_name)),''),p.first_name)`,[orgId,req.query.group_id])).rows);
}
return res.status(400).json({error:'Unknown resource'});
}catch(e){
console.error('GET people operating system:',e);
return res.status(500).json({error:'Unable to load operating system data'});
}
}
if(!['POST','PUT','DELETE'].includes(req.method)){
res.setHeader('Allow','GET,POST,PUT,DELETE');
return res.status(405).json({error:'Method not allowed'});
}
try{
const b=req.body||{},resource=String(b.resource||''),action=String(b.action||'create');
if(!allowed.includes(resource))return res.status(400).json({error:'Invalid resource'});
const id=b.id||null,personId=b.person_id||null;
if(personId&&!await personExists(orgId,personId))return res.status(404).json({error:'Person not found'});

if(resource==='bulk'){
if(req.method!=='POST')return res.status(405).json({error:'Bulk actions require POST'});
const ids=Array.isArray(b.person_ids)?[...new Set(b.person_ids.filter(Boolean))]:[];
if(!ids.length)return res.status(400).json({error:'person_ids is required'});
if(ids.length>500)return res.status(400).json({error:'Bulk operations are limited to 500 people'});
const valid=await pool.query(`SELECT id FROM people WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND COALESCE(status,'active')='active'`,[orgId,ids]);
if(valid.rows.length!==ids.length)return res.status(400).json({error:'One or more people were not found in this organization'});
const actionName=String(b.bulk_action||'').trim();
if(actionName==='set_type'){
const type=String(b.type||'').trim();
if(!type)return res.status(400).json({error:'type is required'});
const r=await pool.query(`UPDATE people SET type=$3,updated_at=NOW() WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND COALESCE(status,'active')='active' RETURNING id`,[orgId,ids,type]);
return res.status(200).json({updated:r.rowCount,ids:r.rows.map(x=>x.id)});
}
if(actionName==='set_status'){
const status=String(b.status||'').trim();
if(!status)return res.status(400).json({error:'status is required'});
const r=await pool.query(`UPDATE people SET status=$3,updated_at=NOW() WHERE organization_id=$1 AND id=ANY($2::uuid[]) RETURNING id`,[orgId,ids,status]);
return res.status(200).json({updated:r.rowCount,ids:r.rows.map(x=>x.id)});
}
if(actionName==='add_group'){
if(!b.group_id)return res.status(400).json({error:'group_id is required'});
const g=await pool.query(`SELECT id FROM organization_groups WHERE organization_id=$1 AND id=$2 AND active=true`,[orgId,b.group_id]);
if(!g.rows.length)return res.status(404).json({error:'Group not found'});
const r=await pool.query(`INSERT INTO person_memberships(organization_id,person_id,group_id,membership_type,status,role,metadata,created_by) SELECT $1,id,$3,$4,$5,$6,$7,$8 FROM people WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND COALESCE(status,'active')='active' ON CONFLICT DO NOTHING RETURNING person_id`,[orgId,ids,b.group_id,b.membership_type||'member',b.membership_status||'active',b.role||null,json(b.metadata),req.user.id]);
return res.status(200).json({added:r.rowCount,ids:r.rows.map(x=>x.person_id)});
}
if(actionName==='remove_group'){
if(!b.group_id)return res.status(400).json({error:'group_id is required'});
const r=await pool.query(`DELETE FROM person_memberships WHERE organization_id=$1 AND person_id=ANY($2::uuid[]) AND group_id=$3 RETURNING person_id`,[orgId,ids,b.group_id]);
return res.status(200).json({removed:r.rowCount,ids:r.rows.map(x=>x.person_id)});
}
if(actionName==='set_lifecycle'){
if(!b.stage_id)return res.status(400).json({error:'stage_id is required'});
const stage=await pool.query(`SELECT id FROM lifecycle_stages WHERE organization_id=$1 AND id=$2 AND active=true`,[orgId,b.stage_id]);
if(!stage.rows.length)return res.status(404).json({error:'Lifecycle stage not found'});
const client=await pool.connect();
try{
await client.query('BEGIN');
await client.query(`UPDATE person_lifecycle SET ended_at=NOW() WHERE organization_id=$1 AND person_id=ANY($2::uuid[]) AND ended_at IS NULL`,[orgId,ids]);
await client.query(`INSERT INTO person_lifecycle(organization_id,person_id,stage_id,reason,evidence,changed_by) SELECT $1,id,$3,$4,$5,$6 FROM people WHERE organization_id=$1 AND id=ANY($2::uuid[])`,[orgId,ids,b.stage_id,b.reason||null,json(b.evidence),req.user.id]);
await client.query('COMMIT');
return res.status(200).json({updated:ids.length,ids});
}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
return res.status(400).json({error:'Unsupported bulk action'});
}

if(resource==='relationship'){
if(action==='delete'){
if(!id)return res.status(400).json({error:'id is required'});
const r=await pool.query(`DELETE FROM person_relationships WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id]);
return r.rows.length?res.status(200).json(r.rows[0]):res.status(404).json({error:'Relationship not found'});
}
if(!personId||!b.related_person_id)return res.status(400).json({error:'person_id and related_person_id are required'});
if(!await personExists(orgId,b.related_person_id))return res.status(404).json({error:'Related person not found'});
const strength=Number.isFinite(Number(b.strength))?Math.max(0,Math.min(1,Number(b.strength))):0;
const r=await pool.query(`INSERT INTO person_relationships(organization_id,person_id,related_person_id,relationship_type,strength,evidence,source,active) VALUES($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT(organization_id,person_id,related_person_id,relationship_type) DO UPDATE SET strength=EXCLUDED.strength,evidence=EXCLUDED.evidence,source=EXCLUDED.source,active=true,updated_at=NOW() RETURNING *`,[orgId,personId,b.related_person_id,String(b.relationship_type||'related').trim(),strength,json(b.evidence),b.source||'human']);
return res.status(200).json(r.rows[0]);
}

if(resource==='membership'){
if(action==='delete'){
if(!id)return res.status(400).json({error:'id is required'});
const r=await pool.query(`DELETE FROM person_memberships WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id]);
return r.rows.length?res.status(200).json(r.rows[0]):res.status(404).json({error:'Membership not found'});
}
if(!personId)return res.status(400).json({error:'person_id is required'});
if(b.group_id){
const g=await pool.query(`SELECT id FROM organization_groups WHERE organization_id=$1 AND id=$2 AND active=true`,[orgId,b.group_id]);
if(!g.rows.length)return res.status(404).json({error:'Group not found'});
}
if(action==='update'){
if(!id||!await rowExists(orgId,'person_memberships',id))return res.status(404).json({error:'Membership not found'});
const r=await pool.query(`UPDATE person_memberships SET group_id=$3,membership_type=$4,status=$5,role=$6,external_ref=$7,start_date=$8,end_date=$9,metadata=$10,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id,value(b.group_id),value(b.membership_type,'member'),value(b.status,'active'),value(b.role),value(b.external_ref),value(b.start_date),value(b.end_date),json(b.metadata)]);
return res.status(200).json(r.rows[0]);
}
const r=await pool.query(`INSERT INTO person_memberships(organization_id,person_id,group_id,membership_type,status,role,external_ref,start_date,end_date,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[orgId,personId,value(b.group_id),value(b.membership_type,'member'),value(b.status,'active'),value(b.role),value(b.external_ref),value(b.start_date),value(b.end_date),json(b.metadata),req.user.id]);
return res.status(201).json(r.rows[0]);
}

if(resource==='role'){
if(action==='delete'){
if(!id)return res.status(400).json({error:'id is required'});
const r=await pool.query(`DELETE FROM person_roles WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id]);
return r.rows.length?res.status(200).json(r.rows[0]):res.status(404).json({error:'Role not found'});
}
if(!personId||!b.role)return res.status(400).json({error:'person_id and role are required'});
if(action==='update'){
if(!id||!await rowExists(orgId,'person_roles',id))return res.status(404).json({error:'Role not found'});
const r=await pool.query(`UPDATE person_roles SET role=$3,status=$4,start_date=$5,end_date=$6,metadata=$7,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id,String(b.role).trim(),value(b.status,'active'),value(b.start_date),value(b.end_date),json(b.metadata)]);
return res.status(200).json(r.rows[0]);
}
const r=await pool.query(`INSERT INTO person_roles(organization_id,person_id,role,status,start_date,end_date,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(organization_id,person_id,role) DO UPDATE SET status=EXCLUDED.status,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,metadata=EXCLUDED.metadata,updated_at=NOW() RETURNING *`,[orgId,personId,String(b.role).trim(),value(b.status,'active'),value(b.start_date),value(b.end_date),json(b.metadata),req.user.id]);
return res.status(200).json(r.rows[0]);
}

if(resource==='field'){
if(action==='delete'){
if(!id)return res.status(400).json({error:'id is required'});
const r=await pool.query(`DELETE FROM person_field_values WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id]);
return r.rows.length?res.status(200).json(r.rows[0]):res.status(404).json({error:'Field value not found'});
}
if(!personId||!b.field_id)return res.status(400).json({error:'person_id and field_id are required'});
const r=await pool.query(`INSERT INTO person_field_values(organization_id,person_id,field_id,value) SELECT $1,$2,id,$4 FROM person_field_definitions WHERE organization_id=$1 AND id=$3 ON CONFLICT(organization_id,person_id,field_id) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW() RETURNING *`,[orgId,personId,b.field_id,b.value===undefined?null:b.value]);
return r.rows.length?res.status(200).json(r.rows[0]):res.status(404).json({error:'Field definition not found'});
}

if(resource==='group'){
if(action==='delete'){
if(!id)return res.status(400).json({error:'id is required'});
const r=await pool.query(`UPDATE organization_groups SET active=false,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id]);
return r.rows.length?res.status(200).json(r.rows[0]):res.status(404).json({error:'Group not found'});
}
if(!b.name)return res.status(400).json({error:'name is required'});
if(action==='update'){
if(!id||!await rowExists(orgId,'organization_groups',id))return res.status(404).json({error:'Group not found'});
const r=await pool.query(`UPDATE organization_groups SET name=$3,group_type=$4,description=$5,active=$6,metadata=$7,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id,String(b.name).trim(),value(b.group_type,'group'),value(b.description,''),value(b.active,true),json(b.metadata)]);
return res.status(200).json(r.rows[0]);
}
const r=await pool.query(`INSERT INTO organization_groups(organization_id,name,group_type,description,active,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[orgId,String(b.name).trim(),value(b.group_type,'group'),value(b.description,''),value(b.active,true),json(b.metadata),req.user.id]);
return res.status(201).json(r.rows[0]);
}

if(resource==='document'||resource==='task'||resource==='communication'){
const table=tables[resource];
if(action==='delete'){
if(!id)return res.status(400).json({error:'id is required'});
const r=await pool.query(`DELETE FROM ${table} WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id]);
return r.rows.length?res.status(200).json(r.rows[0]):res.status(404).json({error:`${resource} not found`});
}
if(!personId)return res.status(400).json({error:'person_id is required'});
const data=resourceData(resource,b);
if(action==='update'){
if(!id||!await rowExists(orgId,table,id))return res.status(404).json({error:`${resource} not found`});
const keys=Object.keys(data),sets=keys.map((k,i)=>`${k}=$${i+3}`).join(','),vals=keys.map(k=>data[k]);
const r=await pool.query(`UPDATE ${table} SET ${sets},updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id,...vals]);
return res.status(200).json(r.rows[0]);
}
const keys=Object.keys(data),cols=['organization_id','person_id',...keys],placeholders=cols.map((_,i)=>`$${i+1}`).join(','),vals=[orgId,personId,...keys.map(k=>data[k])];
if(resource==='communication')cols.push('created_by'),placeholders+=`,${cols.length}`,vals.push(req.user.id);
else if(resource==='task')cols.push('created_by'),placeholders+=`,${cols.length}`,vals.push(req.user.id);
else cols.push('created_by'),placeholders+=`,${cols.length}`,vals.push(req.user.id);
const r=await pool.query(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${placeholders}) RETURNING *`,vals);
return res.status(201).json(r.rows[0]);
}

if(resource==='lifecycle'){
if(action==='transition'){
if(!personId||!b.stage_id)return res.status(400).json({error:'person_id and stage_id are required'});
return res.status(200).json(await transitionLifecycle(orgId,personId,b.stage_id,b.reason,b.evidence,req.user.id));
}
return res.status(400).json({error:'Unsupported lifecycle action'});
}

if(resource==='note'){
if(req.method==='DELETE')return res.status(400).json({error:'Notes are not deleted through this endpoint'});
if(!personId)return res.status(400).json({error:'person_id is required'});
const event=await addTimelineEvent(orgId,personId,{event_type:b.event_type||'NOTE',title:b.title||'Note',description:b.description||'',metadata:b.metadata,source:b.source||'human',occurred_at:b.occurred_at});
return res.status(201).json(event);
}

if(resource==='field_definition'){
if(action==='delete'){
if(!id)return res.status(400).json({error:'id is required'});
const r=await pool.query(`UPDATE person_field_definitions SET active=false,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id]);
return r.rows.length?res.status(200).json(r.rows[0]):res.status(404).json({error:'Field definition not found'});
}
if(!b.name||!b.key)return res.status(400).json({error:'name and key are required'});
if(action==='update'){
if(!id||!await rowExists(orgId,'person_field_definitions',id))return res.status(404).json({error:'Field definition not found'});
const r=await pool.query(`UPDATE person_field_definitions SET name=$3,key=$4,data_type=$5,description=$6,options=$7,required=$8,active=$9,sort_order=$10,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id,String(b.name).trim(),String(b.key).trim(),value(b.data_type,'text'),value(b.description,''),json(b.options),value(b.required,false),value(b.active,true),value(b.sort_order,0)]);
return res.status(200).json(r.rows[0]);
}
const r=await pool.query(`INSERT INTO person_field_definitions(organization_id,name,key,data_type,description,options,required,active,sort_order,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[orgId,String(b.name).trim(),String(b.key).trim(),value(b.data_type,'text'),value(b.description,''),json(b.options),value(b.required,false),value(b.active,true),value(b.sort_order,0),req.user.id]);
return res.status(201).json(r.rows[0]);
}

if(resource==='lifecycle_stage'){
if(action==='delete'){
if(!id)return res.status(400).json({error:'id is required'});
const r=await pool.query(`UPDATE lifecycle_stages SET active=false,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id]);
return r.rows.length?res.status(200).json(r.rows[0]):res.status(404).json({error:'Lifecycle stage not found'});
}
if(!b.name||!b.stage_key)return res.status(400).json({error:'name and stage_key are required'});
if(action==='update'){
if(!id||!await rowExists(orgId,'lifecycle_stages',id))return res.status(404).json({error:'Lifecycle stage not found'});
const r=await pool.query(`UPDATE lifecycle_stages SET name=$3,stage_key=$4,description=$5,active=$6,sort_order=$7,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id,String(b.name).trim(),String(b.stage_key).trim(),value(b.description,''),value(b.active,true),value(b.sort_order,0)]);
return res.status(200).json(r.rows[0]);
}
const r=await pool.query(`INSERT INTO lifecycle_stages(organization_id,name,stage_key,description,active,sort_order,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[orgId,String(b.name).trim(),String(b.stage_key).trim(),value(b.description,''),value(b.active,true),value(b.sort_order,0),req.user.id]);
return res.status(201).json(r.rows[0]);
}

if(resource==='view'||resource==='segment'){
const table=resource==='view'?'person_views':'person_segments';
if(action==='delete'){
if(!id)return res.status(400).json({error:'id is required'});
const r=await pool.query(`DELETE FROM ${table} WHERE organization_id
