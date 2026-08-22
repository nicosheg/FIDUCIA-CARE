// pages/api/aria/initialize.js
import { initializeCommunity } from '../../../lib/aria/director';
import { withAdmin } from '../../../lib/apiHelpers';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const orgId = req.org.id;

  try {
    await initializeCommunity(orgId);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Initialize API error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export default withAdmin(handler);
