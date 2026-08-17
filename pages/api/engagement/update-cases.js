// pages/api/engagement/update-cases.js
import { updateEngagementCases } from '../../../lib/aria/engagementCases';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const orgId = req.query.organization_id || req.body?.organization_id || 'demo-org';

  try {
    await updateEngagementCases(orgId);
    res.status(200).json({ success: true, message: 'Engagement cases updated' });
  } catch (err) {
    console.error('Update cases error:', err);
    res.status(500).json({ error: err.message });
  }
}
