// pages/api/people/operating-system.js
import pool from '../../../lib/db';
import {withOrg} from '../../../lib/apiHelpers';
import {getPerson360,getGroups,getLifecycleStages,getFieldDefinitions,transitionLifecycle,addTimelineEvent} from '../../../lib/peopleOperatingSystem';

const allowed=['relationship','membership','role','field','financial','document','task','communication','group','field_definition','lifecycle_stage','view','segment','segment_member'];

async function personExists(orgId,id){return (await pool.query(`SELECT id FROM people WHERE organization_id=$1 AND id=$2 LIMIT 1`,[orgId,id])).rows.length>0}
async function run(req,res){
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
if(resource==='views')return res.status(200).json((await pool.query(`SELECT * FROM person_views WHERE organization_id=$1 AND (shared=true OR created_by=$2) ORDER BY name`,[orgId,req.user.id])).rows);
if(resource==='segments')return res.status(200).json((await pool.query(`SELECT * FROM person_segments WHERE organization_id=$1 AND active=true ORDER BY name`,[orgId])).rows);
return res.status(400).json({error:'Unknown resource'});
}catch(e){console.error('GET people operating system:',e);return res.status(500).json({error:'Unable to load operating system data'})}
}
if(req.method!=='POST'&&req.method!=='PUT'&&req.method!=='DELETE'){res.setHeader('Allow','GET,POST,PUT,DELETE');return res.status(405).json({error:'Method not allowed'})}
try{
const b=req.body||{},resource=String(b.resource||''),action=String(b.action||'create');
if(!allowed.includes(resource))return res.status(400).json({error:'Invalid resource'});
const id=b.id||null,personId=b.person_id||null;
if(personId&&!await personExists(orgId,personId))return res.status(404).json({error:'Person not found'});
if(resource==='relationship'){
if(action==='delete')return res.status(200).json((await pool.query(`DELETE FROM person_relationships WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id])).rows[0]||null);
if(!b.related_person_id||!await personExists(orgId,b.related_person_id))return res.status(400).json({error:'related_person_id is required and must belong to the organization'});
const r=await pool.query(`INSERT INTO person_relationships(organization_id,person_id,related_person_id,relationship_type,strength,evidence,source,active) VALUES($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT(organization_id,person_id,related_person_id,relationship_type) DO UPDATE SET strength=EXCLUDED.strength,evidence=EXCLUDED.evidence,source=EXCLUDED.source,active=true,updated_at=NOW() RETURNING *`,[orgId,personId,b.related_person_id,String(b.relationship_type||'related'),Number.isFinite(Number(b.strength))?Number(b.strength):0,b.evidence&&typeof b.evidence==='object'?b.evidence:{},b.source||'human']);
return res.status(200).json(r.rows[0]);
}
if(resource==='membership'){
if(action==='delete')return res.status(200).json((await pool.query(`DELETE FROM person_memberships WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id])).rows[0]||null);
if(b.group_id){const g=await pool.query(`SELECT id FROM organization_groups WHERE organization_id=$1 AND id=$2`,[orgId,b.group_id]);if(!g.rows.length)return res.status(400).json({error:'Group not found'})}
const r=await pool.query(`INSERT INTO person_memberships(organization_id,person_id,group_id,membership_type,status,role,external_ref,start_date,end_date,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[orgId,personId,b.group_id||null,b.membership_type||'member',b.status||'active',b.role||null,b.external_ref||null,b.start_date||null,b.end_date||null,b.metadata&&typeof b.metadata==='object'?b.metadata:{},req.user.id]);
return res.status(201).json(r.rows[0]);
}
if(resource==='role'){
if(action==='delete')return res.status(200).json((await pool.query(`DELETE FROM person_roles WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id])).rows[0]||null);
if(!b.role)return res.status(400).json({error:'role is required'});
const r=await pool.query(`INSERT INTO person_roles(organization_id,person_id,role,status,start_date,end_date,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(organization_id,person_id,role) DO UPDATE SET status=EXCLUDED.status,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,metadata=EXCLUDED.metadata,updated_at=NOW() RETURNING *`,[orgId,personId,String(b.role).trim(),b.status||'active',b.start_date||null,b.end_date||null,b.metadata&&typeof b.metadata==='object'?b.metadata:{},req.user.id]);
return res.status(200).json(r.rows[0]);
}
if(resource==='field'){
if(action==='delete')return res.status(200).json((await pool.query(`DELETE FROM person_field_values WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id])).rows[0]||null);
if(!b.field_id)return res.status(400).json({error:'field_id is required'});
const r=await pool.query(`INSERT INTO person_field_values(organization_id,person_id,field_id,value) SELECT $1,$2,id,$4 FROM person_field_definitions WHERE organization_id=$1 AND id=$3 ON CONFLICT(organization_id,person_id,field_id) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW() RETURNING *`,[orgId,personId,b.field_id,b.value===undefined?null:b.value]);
return r.rows.length?res.status(200).json(r.rows[0]):res.status(404).json({error:'Field definition not found'});
}
if(resource==='group'){
if(action==='delete')return res.status(200).json((await pool.query(`UPDATE organization_groups SET active=false,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id])).rows[0]||null);
if(!b.name)return res.status(400).json({error:'name is required'});
if(b.parent_group_id){const p=await pool.query(`SELECT id FROM organization_groups WHERE organization_id=$1 AND id=$2`,[orgId,b.parent_group_id]);if(!p.rows.length)return res.status(400).json({error:'Parent group not found'})}
const r=action==='update'?await pool.query(`UPDATE organization_groups SET name=$3,group_type=$4,description=$5,parent_group_id=$6,metadata=$7,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id,b.name,b.group_type||'group',b.description||null,b.parent_group_id||null,b.metadata&&typeof b.metadata==='object'?b.metadata:{}]):await pool.query(`INSERT INTO organization_groups(organization_id,name,group_type,description,parent_group_id,metadata,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[orgId,b.name,b.group_type||'group',b.description||null,b.parent_group_id||null,b.metadata&&typeof b.metadata==='object'?b.metadata:{},req.user.id]);
return res.status(action==='update'?200:201).json(r.rows[0]);
}
if(resource==='field_definition'){
if(action==='delete')return res.status(200).json((await pool.query(`UPDATE person_field_definitions SET active=false,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id])).rows[0]||null);
if(!b.name||!b.key)return res.status(400).json({error:'name and key are required'});
const r=action==='update'?await pool.query(`UPDATE person_field_definitions SET name=$3,data_type=$4,description=$5,options=$6,required=$7,sort_order=$8,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id,b.name,b.data_type||'text',b.description||null,b.options||[],!!b.required,Number(b.sort_order)||0]):await pool.query(`INSERT INTO person_field_definitions(organization_id,name,key,data_type,description,options,required,sort_order,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[orgId,b.name,b.key,b.data_type||'text',b.description||null,b.options||[],!!b.required,Number(b.sort_order)||0,req.user.id]);
return res.status(action==='update'?200:201).json(r.rows[0]);
}
if(resource==='lifecycle_stage'){
if(action==='delete')return res.status(200).json((await pool.query(`UPDATE lifecycle_stages SET active=false,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id])).rows[0]||null);
if(!b.name||!b.stage_key)return res.status(400).json({error:'name and stage_key are required'});
const r=action==='update'?await pool.query(`UPDATE lifecycle_stages SET name=$3,description=$4,sort_order=$5,color=$6,updated_at=NOW() WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id,b.name,b.description||null,Number(b.sort_order)||0,b.color||null]):await pool.query(`INSERT INTO lifecycle_stages(organization_id,name,stage_key,description,sort_order,color,is_default,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[orgId,b.name,b.stage_key,b.description||null,Number(b.sort_order)||0,b.color||null,!!b.is_default,req.user.id]);
return res.status(action==='update'?200:201).json(r.rows[0]);
}
if(resource==='view'||resource==='segment'){
const table=resource==='view'?'person_views':'person_segments';
if(action==='delete')return res.status(200).json((await pool.query(`DELETE FROM ${table} WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id])).rows[0]||null);
if(!b.name)return res.status(400).json({error:'name is required'});
const fields=resource==='view'?`name,description,filters,columns,sort,visible_to_roles,shared,created_by`:`name,description,filters,created_by`;
const values=resource==='view'?[orgId,b.name,b.description||null,b.filters||{},b.columns||[],b.sort||{},b.visible_to_roles||['owner','admin'],!!b.shared,req.user.id]:[orgId,b.name,b.description||null,b.filters||{},req.user.id];
const placeholders=values.map((_,i)=>`$${i+1}`).join(',');
const r=await pool.query(`INSERT INTO ${table}(organization_id,${fields}) VALUES(${placeholders}) RETURNING *`,values);
return res.status(201).json(r.rows[0]);
}
if(resource==='segment_member'){
if(!b.segment_id||!personId)return res.status(400).json({error:'segment_id and person_id are required'});
if(action==='delete')return res.status(200).json((await pool.query(`DELETE FROM person_segment_members WHERE organization_id=$1 AND segment_id=$2 AND person_id=$3 RETURNING *`,[orgId,b.segment_id,personId])).rows[0]||null);
const r=await pool.query(`INSERT INTO person_segment_members(organization_id,segment_id,person_id) VALUES($1,$2,$3) ON CONFLICT(organization_id,segment_id,person_id) DO NOTHING RETURNING *`,[orgId,b.segment_id,personId]);
return res.status(201).json(r.rows[0]||null);
}
if(['financial','document','task','communication'].includes(resource)){
const table={financial:'person_financial_records',document:'person_documents',task:'person_tasks',communication:'person_communications'}[resource];
if(action==='delete')return res.status(200).json((await pool.query(`DELETE FROM ${table} WHERE organization_id=$1 AND id=$2 RETURNING *`,[orgId,id])).rows[0]||null);
const maps={
financial:['record_type','status','amount','currency','reference','due_date','paid_at','expires_at','description','metadata'],
document:['name','document_type','storage_path','document_url','issued_at','expires_at','metadata'],
task:['title','description','status','priority','due_at','completed_at','assigned_to','metadata'],
communication:['channel','direction','status','subject','content','external_id','occurred_at','metadata']
};
const cols=maps[resource],vals=cols.map(k=>b[k]===undefined?null:b[k]);vals.unshift(orgId,personId);const ph=vals.map((_,i)=>`$${i+1}`).join(',');
const extra=resource==='financial'?'':resource==='document'?'':resource==='task'?',created_by':',created_by';
const r=await pool.query(`INSERT INTO ${table}(organization_id,person_id,${cols.join(',')}${extra}) VALUES(${ph}${extra?', $'+(vals.length+1):''}) RETURNING *`,extra?vals.concat(req.user.id):vals);
return res.status(201).json(r.rows[0]);
}
if(resource==='lifecycle'){
const r=await transitionLifecycle(orgId,personId,b.stage_id,b.reason,b.evidence,req.user.id);
return res.status(201).json(r);
}
if(resource==='note'){
const r=await addTimelineEvent(orgId,personId,b);
return res.status(201).json(r);
}
return res.status(400).json({error:'Unsupported resource'});
}catch(e){console.error('People operating system mutation:',e);return res.status(500).json({error:e.message||'Unable to update person'})}
}
export default withOrg(run);
