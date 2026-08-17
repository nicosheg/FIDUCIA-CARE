// pages/api/engagement/update-metrics.js
import { updateEngagementMetrics } from '../../../lib/aria/engagementIntelligence';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const orgId = req.query.organization_id || req.body?.organization_id || 'demo-org';

  try {
    await updateEngagementMetrics(orgId);
    res.status(200).json({ success: true, message: 'Engagement metrics updated' });
  } catch (err) {
    console.error('Update metrics error:', err);
    res.status(500).json({ error: err.message });
  }
      }
