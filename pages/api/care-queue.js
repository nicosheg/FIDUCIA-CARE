import { getAttentionItems } from '../../lib/ariaIntelligence';

export default async function handler(req, res) {
  const orgId = req.query.organization_id || 'demo-org';
  try {
    const data = await getAttentionItems(orgId);
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
