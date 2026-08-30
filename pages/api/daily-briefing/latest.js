// pages/api/daily-briefing/latest.js
import{withOrg}from'../../../lib/apiHelpers';
import{getDailyIntelligence}from'../../../lib/aria/dailyIntelligence';

/*
 * Daily ARIA briefing.
 * No daily_briefings table is required.
 * Intelligence is generated from current organization data.
 */

async function handler(req,res){
  if(req.method!=='GET'){
    return res.status(405).json({error:'Method not allowed'});
  }

  try{
    const intelligence=await getDailyIntelligence(req.org.id);

    return res.status(200).json({
      briefing:intelligence,
      summary:intelligence.summary,
      firstTime:intelligence.facts.activePeople===0
    });
  }catch(err){
    console.error('[ARIA] Daily intelligence error:',err);
    return res.status(500).json({
      error:'Unable to generate ARIA daily intelligence.'
    });
  }
}

export default withOrg(handler);
