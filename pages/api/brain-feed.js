// pages/api/brain-feed.js
import pool from'../../lib/db';
import{withOrg}from'../../lib/apiHelpers';

/*
 * ARIA Intelligence Feed.
 * Derived from real observations/actions.
 * No aria_brain_feed table required.
 */

async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});

  const orgId=req.org.id;
  const limit=Math.min(Math.max(parseInt(req.query.limit,10)||10,1),50);

  try{
    const result=await pool.query(`
      SELECT
        o.id,
        o.person_id,
        o.type,
        o.severity,
        o.urgency,
        o.attention_score,
        o.confidence,
        o.evidence,
        o.detected_at,
        p.first_name,
        p.last_name
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

    const feed=result.rows.map(item=>({
      id:item.id,
      person_id:item.person_id,
      title:item.type.replace(/_/g,' '),
      description:
        item.evidence?.inference||
        `ARIA detected a ${item.type.replace(/_/g,' ').toLowerCase()} signal.`,
      priority:
        item.severity==='critical'?2:
        item.severity==='high'?2:
        item.severity==='medium'?1:0,
      severity:item.severity,
      urgency:item.urgency,
      attention_score:item.attention_score,
      confidence:item.confidence,
      confidence_type:'OBSERVATION',
      first_name:item.first_name,
      last_name:item.last_name,
      detected_at:item.detected_at
    }));

    return res.status(200).json(feed);
  }catch(err){
    console.error('[ARIA] Brain feed error:',err);
    return res.status(500).json({error:'Unable to load ARIA intelligence feed.'});
  }
}

export default withOrg(handler);
