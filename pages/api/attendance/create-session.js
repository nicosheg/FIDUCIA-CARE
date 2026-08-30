// pages/api/attendance/create-session.js
// Creates an organization-scoped active attendance session.
// The creator is automatically assigned to the session.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { name } = req.body || {};

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({
      error: 'Session name required',
    });
  }

  const orgId = req.org.id;
  const userId = req.user.id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sessionRes = await client.query(
      `INSERT INTO sessions (
         organization_id,
         name,
         status
       )
       VALUES ($1, $2, 'active')
       RETURNING id, name`,
      [orgId, name.trim()]
    );

    const session = sessionRes.rows[0];

    // The creator is automatically allowed to mark attendance.
    await client.query(
      `INSERT INTO session_users (
         session_id,
         user_id
       )
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [session.id, userId]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      id: session.id,
      name: session.name,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    console.error(
      '[ATTENDANCE] Create session error:',
      err
    );

    return res.status(500).json({
      error: 'Could not create attendance session.',
    });
  } finally {
    client.release();
  }
}

export default withOrg(handler);
