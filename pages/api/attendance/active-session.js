// pages/api/attendance/active-session.js
// Returns the organization's current active attendance session.
// Also ensures the logged-in user can participate in that session.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  try {
    const orgId = req.org.id;
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, name
       FROM sessions
       WHERE organization_id = $1
         AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [orgId]
    );

    if (!result.rows.length) {
      return res.status(200).json({
        active: false,
      });
    }

    const activeSession = result.rows[0];

    // Make the current authenticated user an attendance worker
    // for the organization's active session.
    await pool.query(
      `INSERT INTO session_users (session_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [activeSession.id, userId]
    );

    return res.status(200).json({
      active: true,
      session_id: activeSession.id,
      name: activeSession.name,
    });
  } catch (err) {
    console.error(
      '[ATTENDANCE] Active session error:',
      err
    );

    return res.status(500).json({
      error: 'Could not load active session.',
    });
  }
});
