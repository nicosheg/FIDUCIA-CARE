// pages/api/brain-feed.js
import pool from '../../lib/db';
import { withOrg } from '../../lib/apiHelpers';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const orgId = req.org.id;
  const limit = parseInt(req.query.limit) || 20;

  try {
    const result = await pool.query(
      `SELECT * FROM aria_brain_feed
       WHERE organization_id = $1 AND is_read = false
       ORDER BY priority DESC, created_at DESC
       LIMIT $2`,
      [orgId, limit]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Brain feed error:', err);
    res.status(500).json({ error: err.message });
  }
}

export default withOrg(handler);
