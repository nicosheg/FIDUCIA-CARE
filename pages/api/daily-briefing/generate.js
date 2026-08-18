// pages/api/daily-briefing/generate.js
import { generateDailyBriefing } from '../../../lib/aria/dailyBriefing';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const orgId = req.query.organization_id || req.body?.organization_id || 'demo-org';

  try {
    const result = await generateDailyBriefing(orgId);
    res.status(200).json({
      success: true,
      message: 'Daily briefing generated',
      briefing_id: result.id,
    });
  } catch (err) {
    console.error('Generate briefing error:', err);
    res.status(500).json({ error: err.message });
  }
}
