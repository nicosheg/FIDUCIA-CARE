// pages/api/daily-briefing/latest.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const orgId = req.org.id;

  try {
    const briefRes = await pool.query(
      'SELECT * FROM daily_briefings WHERE organization_id = $1 ORDER BY generated_at DESC LIMIT 1',
      [orgId]
    );

    if (briefRes.rows.length === 0) {
      return res.status(404).json({ error: 'No briefing found' });
    }

    res.status(200).json(briefRes.rows[0]);
  } catch (err) {
    console.error('Daily briefing error:', err);
    res.status(500).json({ error: err.message });
  }
}

export default withOrg(handler);
