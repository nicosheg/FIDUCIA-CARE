// lib/aria/relationshipScore.js
import pool from '../db';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

export async function computeRelationshipScore(orgId){
 if(!orgId)throw new Error('orgId required');
 const people=await pool.query(`
  SELECT
   p.id,
   COALESCE(em.participation_count,0)::int AS participation_count,
   COALESCE(em.participation_rate,0)::numeric AS participation_rate,
   COALESCE(em.participation_streak,0)::int AS participation_streak,
   COALESCE(em.inactivity_streak,0)::int AS inactivity_streak,
   COALESCE(em.trend,0)::numeric AS trend,
   COALESCE(em.deviation,0)::numeric AS deviation,
   COALESCE(pos.pos,0)::int AS positive_outcomes,
   COALESCE(pos.neg,0)::int AS negative_outcomes
  FROM people p
  LEFT JOIN engagement_metrics em
   ON em.organization_id=p.organization_id AND em.person_id=p.id
  LEFT JOIN(
   SELECT
    person_id,
    COUNT(*) FILTER(WHERE outcome IN('positive','helpful','worked','returned','became_regular','relationship_strengthened'))::int AS pos,
    COUNT(*) FILTER(WHERE outcome IN('negative','ineffective','did_not_work','unsuccessful','no_response'))::int AS neg
   FROM intelligence_outcomes
   WHERE organization_id=$1
   GROUP BY person_id
  )pos ON pos.person_id=p.id
  WHERE p.organization_id=$1 AND p.status='active'
 `,[orgId]);

 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  for(const row of people.rows){
   let score=50;
   const evidence={
    participation_rate:Number(row.participation_rate),
    participation_streak:Number(row.participation_streak),
    inactivity_streak:Number(row.inactivity_streak),
    trend:Number(row.trend),
    deviation:Number(row.deviation),
    positive_outcomes:Number(row.positive_outcomes),
    negative_outcomes:Number(row.negative_outcomes)
   };

   score+=Math.min(30,Number(row.participation_rate)*.3);
   score+=Math.min(20,Number(row.participation_streak)*5);
   score-=Math.min(20,Number(row.inactivity_streak)*4);
   score+=Math.min(10,Number(row.positive_outcomes)*2);
   score-=Math.min(10,Number(row.negative_outcomes)*2);
   score+=Math.max(-10,Math.min(10,Number(row.trend)*10));

   const finalScore=clamp(Math.round(score),0,100);
   const relationshipState=
    finalScore>=80?'strong':
    finalScore>=60?'healthy':
    finalScore>=40?'developing':
    finalScore>=20?'weak':'unknown';

   evidence.score=finalScore;
   evidence.relationship_state=relationshipState;

   await client.query(`
    INSERT INTO relationship_scores(
     organization_id,person_id,score,relationship_state,evidence,calculated_at,updated_at
    )VALUES($1,$2,$3,$4,$5,NOW(),NOW())
    ON CONFLICT(organization_id,person_id)
    DO UPDATE SET
     score=EXCLUDED.score,
     relationship_state=EXCLUDED.relationship_state,
     evidence=EXCLUDED.evidence,
     calculated_at=NOW(),
     updated_at=NOW()
   `,[orgId,row.id,finalScore,relationshipState,JSON.stringify(evidence)]);
  }
  await client.query('COMMIT');
  return people.rows.length;
 }catch(err){
  try{await client.query('ROLLBACK')}catch{}
  throw err;
 }finally{
  client.release();
 }
}

export async function getTopRelationships(orgId,limit=10){
 if(!orgId)throw new Error('orgId required');
 const safeLimit=Math.min(Math.max(Number(limit)||10,1),100);
 const res=await pool.query(`
  SELECT rs.person_id,rs.score,rs.relationship_state,rs.evidence,
         p.first_name,p.last_name,p.display_name,p.phone
  FROM relationship_scores rs
  JOIN people p ON p.id=rs.person_id AND p.organization_id=rs.organization_id
  WHERE rs.organization_id=$1
  ORDER BY rs.score DESC
  LIMIT $2
 `,[orgId,safeLimit]);
 return res.rows;
  }
