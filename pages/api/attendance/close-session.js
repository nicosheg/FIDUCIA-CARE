// pages/api/attendance/close-session.js
//
// Closing an attendance session:
// - verifies active session
// - verifies user joined the session
// - confirms all present records
// - closes the session
// - starts participation generation

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';
import { generateParticipationFromSession } from '../../../lib/aria/participationGenerator';

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

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const session = await client.query(
      `
      SELECT id, name, status
      FROM sessions
      WHERE id = $1
        AND organization_id = $2
      LIMIT 1
      FOR UPDATE
      `,
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

    // User must have joined the session.
    const membership = await client.query(
      `
      SELECT 1
      FROM session_users
      WHERE session_id = $1
        AND user_id = $2
      LIMIT 1
      `,
      [session_id, userId]
    );

    if (!membership.rows.length) {
      await client.query('ROLLBACK');

      return res.status(403).json({
        error: 'Join this attendance session before closing it.',
      });
    }

    // Confirm only actual PRESENT records.
    await client.query(
      `
      UPDATE attendance_records
      SET
        confirmed = true,
        reviewed_by = $1,
        reviewed_at = NOW()
      WHERE organization_id = $2
        AND session_id = $3
        AND present = true
      `,
      [
        userId,
        orgId,
        session_id,
      ]
    );

    // Close the session.
    const closed = await client.query(
      `
      UPDATE sessions
      SET
        status = 'closed',
        closed_by = $1,
        closed_at = NOW()
      WHERE id = $2
        AND organization_id = $3
        AND status = 'active'
      RETURNING
        id,
        name,
        status,
        started_at,
        closed_at
      `,
      [
        userId,
        session_id,
        orgId,
      ]
    );

    await client.query('COMMIT');

    // Do not make the UI wait for ARIA processing.
    setImmediate(() => {
      generateParticipationFromSession(
        session_id,
        orgId
      ).catch((err) => {
        console.error(
          '[ATTENDANCE] Participation generation failed:',
          err
        );
      });
    });

    return res.status(200).json({
      success: true,
      session: closed.rows[0],
    });

  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    console.error(
      '[ATTENDANCE] Close session error:',
      err
    );

    return res.status(500).json({
      error: 'Could not close attendance.',
    });
  } finally {
    client.release();
  }
});
