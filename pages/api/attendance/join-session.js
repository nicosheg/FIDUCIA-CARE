// pages/api/attendance/join-session.js

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  const { session_id } = req.body || {};

  if (!session_id) {
    return res.status(400).json({
      error: 'session_id is required.',
    });
  }

  const orgId = req.org.id;
  const userId = req.user.id;

  try {
    const session = await pool.query(
      `
      SELECT
        id,
        name,
        status
      FROM sessions
      WHERE id = $1
        AND organization_id = $2
        AND status = 'active'
      LIMIT 1
      `,
      [session_id, orgId]
    );

    if (!session.rows.length) {
      return res.status(404).json({
        error: 'This attendance session is no longer active.',
      });
    }

    await pool.query(
      `
      INSERT INTO session_users (
        session_id,
        user_id
      )
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [session_id, userId]
    );

    return res.status(200).json({
      success: true,
      joined: true,
      session: session.rows[0],
    });

  } catch (err) {
    console.error(
      '[ATTENDANCE] Join session error:',
      err
    );

    return res.status(500).json({
      error: 'Could not join attendance.',
    });
  }
});
