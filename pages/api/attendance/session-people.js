// pages/api/attendance/session-people.js
// Returns people already marked present in a specific active session.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({
      error: 'session_id is required',
    });
  }

  try {
    // Verify the session belongs to the current organization.
    const session = await pool.query(
      `SELECT id
       FROM sessions
       WHERE id = $1
         AND organization_id = $2
         AND status = 'active'
       LIMIT 1`,
      [session_id, req.org.id]
    );

    if (!session.rows.length) {
      return res.status(404).json({
        error: 'Active session not found.',
      });
    }

    const result = await pool.query(
      `SELECT DISTINCT people_id
       FROM attendance_records
       WHERE session_id = $1
         AND present = true`,
      [session_id]
    );

    return res.status(200).json({
      present_ids: result.rows.map(row => row.people_id),
    });
  } catch (err) {
    console.error(
      '[ATTENDANCE] Session people error:',
      err
    );

    return res.status(500).json({
      error: 'Could not load session attendance.',
    });
  }
});
