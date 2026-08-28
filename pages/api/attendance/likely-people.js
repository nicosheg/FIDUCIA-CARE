// pages/api/attendance/likely-people.js
// Returns people commonly marked by an authenticated user.
// Organization comes only from authenticated context.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const requestedUserId = req.query.user;
  if (!requestedUserId) return res.status(400).json({ error: 'User ID required' });

  const orgId = req.org.id;

  try {
    const user = await pool.query(
      `SELECT id FROM users
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [requestedUserId, orgId]
    );
    if (!user.rows.length) {
      return res.status(403).json({ error: 'User not found in your organization.' });
    }

    const result = await pool.query(
      `SELECT p.id, p.display_name, p.first_name, p.phone, p.type, COUNT(um.id) AS mark_count
       FROM user_marks um
       JOIN people p ON p.id = um.people_id
       WHERE um.user_id = $1 AND p.organization_id = $2
       GROUP BY p.id, p.display_name, p.first_name, p.phone, p.type
       ORDER BY mark_count DESC
       LIMIT 20`,
      [requestedUserId, orgId]
    );

    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('Likely people error:', err);
    return res.status(500).json({ error: 'Could not load likely people.' });
  }
});
