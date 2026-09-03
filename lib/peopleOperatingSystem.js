// lib/peopleOperatingSystem.js
import pool from './db';

const tables={
relationships:'person_relationships',memberships:'person_memberships',roles:'person_roles',fields:'person_field_values',fieldDefinitions:'person_field_definitions',lifecycle:'person_lifecycle',financial:'person_financial_records',documents:'person_documents',tasks:'person_tasks',communications:'person_communications'
};

export async function getPerson360(orgId,personId){
if(!orgId||!personId)throw new Error('orgId and personId required');
const p=await pool.query(`SELECT p.*,pi.lifecycle_state AS intelligence_lifecycle,pi.engagement_score,pi.churn_probability,pi.attention_score,pi.attention_level,pi.next_best_action,pi.action_reason,pi.calculated_at AS intelligence_calculated_at FROM people p LEFT JOIN people_intelligence pi ON pi.organization_id=p.organization_id AND pi.person_id=p.id WHERE p.organization_id=$1 AND p.id=$2 LIMIT 1`,[orgId,personId]);
if(!p.rows.length)return null;
const q=async(sql,args=[orgId,personId])=>(await pool.query(sql,args)).rows;
const [relationships,memberships,roles,fields,lifecycle,financial,documents,tasks,communications,timeline,observations,actions]=await Promise.all([
q(`SELECT r.*,rp.first_name AS related_first_name,rp.last_name AS related_last_name,rp.display_name AS related_display_name FROM person_relationships r JOIN people rp ON rp.organization_id=r.organization_id AND rp.id=r.related_person_id WHERE r.organization_id=$1 AND r.person_id=$2 AND r.active=true ORDER BY r.updated_at DESC`),
q(`SELECT m.*,g.name AS group_name,g.group_type FROM person_memberships m LEFT JOIN organization_groups g ON g.organization_id=m.organization_id AND g.id=m.group_id WHERE m.organization_id=$1 AND m.person_id=$2 ORDER BY m.status,m.start_date DESC NULLS LAST`),
q(`SELECT * FROM person_roles WHERE organization_id=$1 AND person_id=$2 ORDER BY status,role`),
q(`SELECT v.*,d.name AS field_name,d.key AS field_key,d.data_type,d.options FROM person_field_values v JOIN person_field_definitions d ON d.organization_id=v.organization_id AND d.id=v.field_id WHERE v.organization_id=$1 AND v.person_id=$2 AND d.active=true ORDER BY d.sort_order,d.name`),
q(`SELECT l.*,s.name AS stage_name,s.stage_key,s.description AS stage_description FROM person_lifecycle l JOIN lifecycle_stages s ON s.organization_id=l.organization_id AND s.id=l.stage_id WHERE l.organization_id=$1 AND l.person_id=$2 ORDER BY l.started_at DESC`),
q(`SELECT * FROM person_financial_records WHERE organization_id=$1 AND person_id=$2 ORDER BY COALESCE(paid_at,created_at) DESC`),
q(`SELECT * FROM person_documents WHERE organization_id=$1 AND person_id=$2 ORDER BY COALESCE(expires_at,issued_at) DESC NULLS LAST,created_at DESC`),
q(`SELECT * FROM person_tasks WHERE organization_id=$1 AND person_id=$2 ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,due_at NULLS LAST,created_at DESC`),
q(`SELECT * FROM person_communications WHERE organization_id=$1 AND person_id=$2 ORDER BY occurred_at DESC,created_at DESC`),
q(`SELECT * FROM timeline_events t WHERE t.people_id=$2 AND EXISTS(SELECT 1 FROM people p WHERE p.organization_id=$1 AND p.id=t.people_id) ORDER BY COALESCE(t.occurred_at,t.created_at) DESC`),
q(`SELECT * FROM aria_observations WHERE organization_id=$1 AND person_id=$2 ORDER BY detected_at DESC`),
q(`SELECT * FROM aria_actions WHERE organization_id=$1 AND person_id=$2 ORDER BY created_at DESC`)
]);
const groups=await pool.query(`SELECT g.*,m.id AS membership_id,m.membership_type,m.role AS membership_role,m.status AS membership_status FROM organization_groups g JOIN person_memberships m ON m.organization_id=g.organization_id AND m.group_id=g.id WHERE g.organization_id=$1 AND m.person_id=$2 ORDER BY g.group_type,g.name`,[orgId,personId]);
return {...p.rows[0],relationships,memberships,roles,fields,lifecycle,financial,documents,tasks,communications,timeline,observations,actions,groups:groups.rows};
}

export async function getGroups(orgId,filters={}){
const values=[orgId],where=['organization_id=$1'];
if(filters.type){values.push(String(filters.type));where.push(`group_type=$${values.length}`)}
if(filters.active!==undefined){values.push(filters.active==='false'?false:true);where.push(`active=$${values.length}`)}
return (await pool.query(`SELECT * FROM organization_groups WHERE ${where.join(' AND ')} ORDER BY group_type,name`,values)).rows;
}

export async function getLifecycleStages(orgId){return (await pool.query(`SELECT * FROM lifecycle_stages WHERE organization_id=$1 AND active=true ORDER BY sort_order,name`,[orgId])).rows;}

export async function getFieldDefinitions(orgId){return (await pool.query(`SELECT * FROM person_field_definitions WHERE organization_id=$1 AND active=true ORDER BY sort_order,name`,[orgId])).rows;}

export async function transitionLifecycle(orgId,personId,stageId,reason,evidence,actorId){
const client=await pool.connect();
try{
await client.query('BEGIN');
const valid=await client.query(`SELECT p.id FROM people p JOIN lifecycle_stages s ON s.organization_id=p.organization_id AND s.id=$3 WHERE p.organization_id=$1 AND p.id=$2 AND s.active=true`,[orgId,personId,stageId]);
if(!valid.rows.length)throw new Error('Person or lifecycle stage not found');
await client.query(`UPDATE person_lifecycle SET ended_at=NOW() WHERE organization_id=$1 AND person_id=$2 AND ended_at IS NULL`,[orgId,personId]);
const result=await client.query(`INSERT INTO person_lifecycle(organization_id,person_id,stage_id,reason,evidence,changed_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[orgId,personId,stageId,reason||null,evidence&&typeof evidence==='object'?evidence:{},actorId||null]);
await client.query(`INSERT INTO timeline_events(people_id,event_type,title,description,metadata,source,occurred_at) VALUES($1,'LIFECYCLE_CHANGED',$2,$3,$4,'human',NOW())`,[personId,'Lifecycle changed',reason||'Lifecycle stage changed',JSON.stringify({stage_id:stageId})]);
await client.query('COMMIT');
return result.rows[0];
}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}

export async function addTimelineEvent(orgId,personId,event){
const person=await pool.query(`SELECT id FROM people WHERE organization_id=$1 AND id=$2 LIMIT 1`,[orgId,personId]);
if(!person.rows.length)throw new Error('Person not found');
return (await pool.query(`INSERT INTO timeline_events(people_id,event_type,title,description,metadata,source,occurred_at) VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,NOW())) RETURNING *`,[personId,event.event_type||'NOTE',event.title||event.event_type||'Note',event.description||'',event.metadata&&typeof event.metadata==='object'?event.metadata:{},event.source||'human',event.occurred_at||null])).rows[0];
}
