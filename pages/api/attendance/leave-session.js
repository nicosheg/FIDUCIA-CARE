// pages/api/attendance/leave-session.js
// FIDUCIA CARE — Admin/Owner only.
// Discards the active organization-wide attendance session.
// Normal users may close their own attendance screen, but cannot discard
// the organization's live attendance session.

import pool from '../../../lib/db';
import { withAdmin } from '../../../lib/apiHelpers';

export default withAdmin(async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session_id } = req.body || {};

  if (!session_id) {
    return res.status(400).json({
      error: 'session_id is required.',
    });
  }

  const orgId = req.org.id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const session = await client.query(
      `SELECT id, name, status, started_by
       FROM sessions
       WHERE id = $1
         AND organization_id = $2
       LIMIT 1
       FOR UPDATE`,
      [session_id, orgId]
    );

    if (!session.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Attendance session not found.',
      });
    }

    if (session.rows[0].status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'This attendance session is already closed.',
      });
    }

    // Discard all live attendance facts for this session.
    await client.query(
      `DELETE FROM attendance_records
       WHERE organization_id = $1
         AND session_id = $2`,
      [orgId, session_id]
    );

    // Remove session membership.
    await client.query(
      `DELETE FROM session_users
       WHERE session_id = $1`,
      [session_id]
    );

    // Remove sections belonging to the discarded session.
    await client.query(
      `DELETE FROM session_sections
       WHERE session_id = $1`,
      [session_id]
    );

    // Finally remove the session itself.
    await client.query(
      `DELETE FROM sessions
       WHERE id = $1
         AND organization_id = $2
         AND status = 'active'`,
      [session_id, orgId]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      discarded: true,
      session_id,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    console.error('[ATTENDANCE] Leave session error:', err);

    return res.status(500).json({
      error: 'Could not leave this attendance session.',
    });
  } finally {
    client.release();
  }
});
