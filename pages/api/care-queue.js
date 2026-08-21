// pages/api/care-queue.js
import pool from '../../lib/db';
import { withOrg } from '../../lib/apiHelpers';

async function handler(req, res) {
  const orgId = req.org.id; // From withOrg

  // POST: trigger intelligence scan (optional)
  if (req.method === 'POST') {
    return res.status(200).json({ message: 'ARIA scan triggered.' });
  }

  // GET: fetch care items from engagement_cases
  if (req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT ec.*, p.first_name, p.phone
         FROM engagement_cases ec
         JOIN people p ON ec.person_id = p.id
         WHERE ec.organization_id = $1 AND ec.resolved = false
         ORDER BY
           CASE ec.risk_level
             WHEN 'critical' THEN 1
             WHEN 'high' THEN 2
             WHEN 'medium' THEN 3
             WHEN 'low' THEN 4
           END,
           ec.inactivity_streak DESC
         LIMIT 30`,
        [orgId]
      );

      const items = result.rows.map(row => ({
        person_id: row.person_id,
        first_name: row.first_name,
        phone: row.phone,
        priority: row.risk_level === 'critical' ? 'high' : row.risk_level === 'high' ? 'medium' : 'low',
        text: `${row.first_name} has been inactive for ${row.inactivity_streak} weeks. ${row.risk_level === 'critical' ? 'Immediate attention needed.' : ''}`,
        risk_level: row.risk_level,
        engagement_status: row.engagement_status,
        inactivity_streak: row.inactivity_streak,
        last_seen: row.last_seen,
        created_at: row.created_at,
      }));

      res.status(200).json(items);
    } catch (err) {
      console.error('Care Queue error:', err);
      res.status(500).json({ error: err.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

export default withOrg(handler);
