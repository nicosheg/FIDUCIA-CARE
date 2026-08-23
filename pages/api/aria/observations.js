// pages/api/aria/observations.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

async function handler(req, res) {
  const orgId = req.org.id;
  const limit = parseInt(req.query.limit) || 10;

  const query = `
    SELECT o.*, p.first_name, p.phone
    FROM aria_observations o
    LEFT JOIN people p ON o.person_id = p.id
    WHERE o.organization_id = $1 AND o.status = 'active'
    ORDER BY o.attention_score DESC
    LIMIT $2
  `;
  try {
    const result = await pool.query(query, [orgId, limit]);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching ARIA observations:', err);
    res.status(500).json({ error: err.message });
  }
}

export default withOrg(handler);
