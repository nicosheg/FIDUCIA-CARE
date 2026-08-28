// pages/api/attendance/active-session.js
// Returns the organization's current active attendance session.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const result = await pool.query(
      `SELECT id,name FROM sessions
       WHERE organization_id=$1 AND status='active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.org.id]
    );

    if (!result.rows.length) {
      return res.status(200).json({ active: false });
    }

    return res.status(200).json({
      active: true,
      session_id: result.rows[0].id,
      name: result.rows[0].name,
    });
  } catch (err) {
    console.error('[ATTENDANCE] Active session error:', err);
    return res.status(500).json({ error: 'Could not load active session.' });
  }
});
