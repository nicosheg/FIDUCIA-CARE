// pages/api/daily-briefing/latest.js
// Daily briefing API.
// 200 + briefing = real ARIA briefing.
// 200 + firstTime = truthful empty state for a new organization.
// 500 = genuine backend/database failure.
// Organization comes exclusively from withOrg authentication.

import pool from '../../../lib/db';
import {withOrg} from '../../../lib/apiHelpers';

async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});

  const orgId=req.org.id;

  try{
    const briefRes=await pool.query(
      'SELECT * FROM daily_briefings WHERE organization_id=$1 ORDER BY generated_at DESC LIMIT 1',
      [orgId]
    );

    if(briefRes.rows.length===0){
      return res.status(200).json({
        briefing:null,
        firstTime:true,
        message:'ARIA is ready. Your space is just getting started.'
      });
    }

    return res.status(200).json({
      briefing:briefRes.rows[0],
      firstTime:false
    });
  }catch(err){
    console.error('Daily briefing error:',err);
    return res.status(500).json({error:'Unable to load the daily briefing.'});
  }
}

export default withOrg(handler);
