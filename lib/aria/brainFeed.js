// lib/aria/brainFeed.js
import pool from '../db';
import{getMemory}from'./organizationMemory';

export async function generateBrainFeed(orgId){
 if(!orgId)throw new Error('orgId required');

 const entries=[];

 const[urgent,returning,newPeople,memory]=await Promise.all([
  pool.query(`
   SELECT p.id,p.first_name,ec.inactivity_streak
   FROM engagement_cases ec
   JOIN people p ON p.id=ec.person_id AND p.organization_id=ec.organization_id
   WHERE ec.organization_id=$1
     AND ec.resolved=false
     AND ec.risk_level IN('high','critical')
   ORDER BY ec.inactivity_streak DESC
   LIMIT 5
  `,[orgId]),
  pool.query(`
   SELECT p.id,p.first_name,em.last_seen
   FROM engagement_metrics em
   JOIN people p ON p.id=em.person_id AND p.organization_id=em.organization_id
   WHERE em.organization_id=$1
     AND em.last_seen>=NOW()-INTERVAL'7 days'
     AND em.inactivity_streak BETWEEN 1 AND 3
   ORDER BY em.last_seen DESC
   LIMIT 5
  `,[orgId]),
  pool.query(`
   SELECT p.id,p.first_name
   FROM engagement_metrics em
   JOIN people p ON p.id=em.person_id AND p.organization_id=em.organization_id
   WHERE em.organization_id=$1
     AND em.participation_count=1
   ORDER BY em.last_seen DESC NULLS LAST
   LIMIT 5
  `,[orgId]),
  getMemory(orgId,'trend_insight')
 ]);

 urgent.rows.forEach(r=>entries.push({
  feed_type:'warning',
  title:`${r.first_name} may need attention`,
  description:`Attendance has been quiet for ${r.inactivity_streak} week(s).`,
  priority:4,
  person_id:r.id,
  dedupe_key:`urgent:${r.id}`
 }));

 returning.rows.forEach(r=>entries.push({
  feed_type:'win',
  title:`${r.first_name} is reconnecting`,
  description:'Their recent participation suggests a renewed connection.',
  priority:2,
  person_id:r.id,
  dedupe_key:`returning:${r.id}:${new Date().toISOString().slice(0,10)}`
 }));

 newPeople.rows.forEach(r=>entries.push({
  feed_type:'opportunity',
  title:`Welcome ${r.first_name}`,
  description:'This person is newly known to the organization.',
  priority:2,
  person_id:r.id,
  dedupe_key:`new:${r.id}`
 }));

 memory.slice(0,3).forEach(r=>entries.push({
  feed_type:'insight',
  title:r.memory_key,
  description:r.memory_value?.summary||'',
  priority:1,
  person_id:null,
  dedupe_key:`memory:${r.memory_type}:${r.memory_key}`
 }));

 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  for(const e of entries){
   await client.query(`
    INSERT INTO aria_brain_feed(
     organization_id,feed_type,title,description,priority,person_id,metadata,dedupe_key,is_read,created_at,updated_at
    )VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,NOW(),NOW())
    ON CONFLICT(organization_id,dedupe_key)
    DO UPDATE SET
     title=EXCLUDED.title,
     description=EXCLUDED.description,
     priority=EXCLUDED.priority,
     person_id=EXCLUDED.person_id,
     metadata=EXCLUDED.metadata,
     updated_at=NOW()
   `,[orgId,e.feed_type,e.title,e.description,e.priority,e.person_id,{},e.dedupe_key]);
  }
  await client.query('COMMIT');
  return entries;
 }catch(err){
  try{await client.query('ROLLBACK')}catch{}
  throw err;
 }finally{
  client.release();
 }
}

export async function getBrainFeed(orgId,limit=20){
 const safeLimit=Math.min(Math.max(Number(limit)||20,1),100);
 const result=await pool.query(`
  SELECT *
  FROM aria_brain_feed
  WHERE organization_id=$1 AND is_read=false
  ORDER BY priority DESC,created_at DESC
  LIMIT $2
 `,[orgId,safeLimit]);
 return result.rows;
}

export async function markFeedRead(orgId,feedId){
 await pool.query(`UPDATE aria_brain_feed SET is_read=true,updated_at=NOW() WHERE id=$1 AND organization_id=$2`,[feedId,orgId]);
}
