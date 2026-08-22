// pages/api/recommendations.js
import { getPendingRecommendations } from '../../lib/aria/recommendationEngine';
import { withOrg } from '../../lib/apiHelpers';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const orgId = req.org.id;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const items = await getPendingRecommendations(orgId, limit);
    res.status(200).json(items);
  } catch (err) {
    console.error('Recommendations error:', err);
    res.status(500).json({ error: err.message });
  }
}

export default withOrg(handler);
