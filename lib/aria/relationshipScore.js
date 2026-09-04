// lib/aria/relationshipScore.js
import pool from'../db';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

export async function computeRelationshipScore(orgId){
 if(!orgId)throw new Error('orgId required');
 const people=await pool.query(`SELECT p.id,COALESCE(em.participation_count,0)::int AS participation_count,COALESCE(em.participation_rate,0)::numeric AS participation_rate,COALESCE(em.participation_streak,0)::int AS participation_streak,COALESCE(em.trend,0)::numeric AS trend,COALESCE(em.confidence,0)::numeric AS confidence,COALESCE(pm.memory_count,0)::int AS memory_count,COALESCE(io.positive_count,0)::int AS positive_count,COALESCE(io.negative_count,0)::int AS negative_count FROM people p LEFT JOIN engagement_metrics em ON em.organization_id=p.organization_id AND em.person_id=p.id LEFT JOIN(SELECT organization_id,person_id,COUNT(*)::int memory_count FROM person_memory WHERE active=true GROUP BY organization_id,person_id)pm ON pm.organization_id=p.organization_id AND pm.person_id=p.id LEFT JOIN(SELECT organization_id,person_id,COUNT(*) FILTER(WHERE outcome IN('positive','helpful','worked','returned','became_regular','relationship_strengthened'))::int positive_count,COUNT(*) FILTER(WHERE outcome IN('negative','ineffective','did_not_work','unsuccessful','no_response'))::int negative_count FROM intelligence_outcomes GROUP BY organization_id,person_id)io ON io.organization_id=p.organization_id AND io.person_id=p.id WHERE p.organization_id=$1 AND p.status='active'`,[orgId]);
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  for(const r of people.rows){
   let score=35;
   score+=Math.min(25,Number(r.participation_rate)*.25);
   score+=Math.min(15,Number(r.participation_streak)*3);
   score+=Math.min(10,Number(r.memory_count)*2);
   score+=Math.min(10,Number(r.positive_count)*2);
   score-=Math.min(8,Number(r.negative_count)*2);
   score+=Math.max(-5,Math.min(5,Number(r.trend)*5));
   score=clamp(Math.round(score),0,100);
   const state=score>=80?'strong':score>=60?'healthy':score>=40?'developing':'known';
   const evidence={participation_rate:Number(r.participation_rate),participation_streak:Number(r.participation_streak),memory_count:Number(r.memory_count),positive_outcomes:Number(r.positive_count),negative_outcomes:Number(r.negative_count),trend:Number(r.trend),confidence:Number(r.confidence),score,relationship_state:state};
   await client.query(`INSERT INTO relationship_scores(organization_id,person_id,score,relationship_state,evidence,calculated_at,updated_at)VALUES($1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT(organization_id,person_id) DO UPDATE SET score=EXCLUDED.score,relationship_state=EXCLUDED.relationship_state,evidence=EXCLUDED.evidence,calculated_at=NOW(),updated_at=NOW()`,[orgId,r.id,score,state,JSON.stringify(evidence)]);
  }
  await client.query('COMMIT');
  return people.rows.length;
 }catch(e){try{await client.query('ROLLBACK')}catch{}throw e}finally{client.release()}
}

export async function getTopRelationships(orgId,limit=10){
 if(!orgId)throw new Error('orgId required');
 const n=Math.min(Math.max(Number(limit)||10,1),100);
 const r=await pool.query(`SELECT rs.person_id,rs.score,rs.relationship_state,rs.evidence,p.first_name,p.last_name,p.display_name,p.phone FROM relationship_scores rs JOIN people p ON p.id=rs.person_id AND p.organization_id=rs.organization_id WHERE rs.organization_id=$1 ORDER BY rs.score DESC LIMIT $2`,[orgId,n]);
 return r.rows;
}
