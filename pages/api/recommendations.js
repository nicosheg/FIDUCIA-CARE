// pages/api/recommendations.js
import { getPendingRecommendations } from '../../lib/aria/recommendationEngine';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const orgId = req.query.organization_id || 'demo-org';

  try {
    const items = await getPendingRecommendations(orgId);
    res.status(200).json(items);
  } catch (err) {
    console.error('Recommendations error:', err);
    res.status(500).json({ error: err.message });
  }
}
