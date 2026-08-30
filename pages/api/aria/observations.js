// pages/api/aria/observations.js
import pool from'../../../lib/db';
import{withOrg}from'../../../lib/apiHelpers';
import{getAggregatedObservations}from'../../../lib/aria/observationEngine';

async function handler(req,res){
  if(req.method!=='GET'){
    return res.status(405).json({error:'Method not allowed'});
  }

  const orgId=req.org.id;
  const aggregated=req.query.aggregated!=='false';
  const limit=Math.min(
    Math.max(parseInt(req.query.limit,10)||10,1),
    50
  );

  try{
    const top=await pool.query(`
      SELECT
        o.*,
        p.first_name,
        p.last_name,
        p.phone
      FROM aria_observations o
      LEFT JOIN people p
        ON p.id=o.person_id
       AND p.organization_id=o.organization_id
      WHERE o.organization_id=$1
        AND o.status='active'
        AND(o.expires_at IS NULL OR o.expires_at>NOW())
      ORDER BY o.attention_score DESC,o.detected_at DESC
      LIMIT $2
    `,[orgId,limit]);

    if(!aggregated){
      return res.status(200).json(top.rows);
    }

    const summaries=await getAggregatedObservations(orgId);

    return res.status(200).json({
      summaries,
      top:top.rows
    });
  }catch(err){
    console.error('[ARIA] Observations error:',err);
    return res.status(500).json({
      error:'Unable to load ARIA observations.'
    });
  }
}

export default withOrg(handler);
