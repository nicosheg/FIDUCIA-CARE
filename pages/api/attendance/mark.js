// pages/api/attendance/mark.js
// Canonical attendance marking endpoint.
//
// Rules:
// - User must belong to the organization.
// - Session must be active.
// - Person must belong to the organization.
// - Only PRESENT records are created.
// - organization_id is always written.
// - One person can only have one record in a session.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  const {
    session_id,
    people_id,
  } = req.body || {};

  if (!session_id || !people_id) {
    return res.status(400).json({
      error: 'Missing session_id or people_id',
    });
  }

  const orgId = req.org.id;
  const userId = req.user.id;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // --------------------------------------------------
    // 1. Verify active session
    // --------------------------------------------------

    const session = await client.query(
      `
      SELECT id, name
      FROM sessions
      WHERE id = $1
        AND organization_id = $2
        AND status = 'active'
      LIMIT 1
      `,
      [session_id, orgId]
    );

    if (!session.rows.length) {
      await client.query('ROLLBACK');

      return res.status(403).json({
        error: 'This attendance session is no longer active.',
      });
    }

    // --------------------------------------------------
    // 2. Verify person belongs to this organization
    // --------------------------------------------------

    const person = await client.query(
      `
      SELECT
        id,
        first_name,
        last_name
      FROM people
      WHERE id = $1
        AND organization_id = $2
        AND COALESCE(status, 'active') = 'active'
      LIMIT 1
      `,
      [people_id, orgId]
    );

    if (!person.rows.length) {
      await client.query('ROLLBACK');

      return res.status(403).json({
        error: 'Person not found in your organization.',
      });
    }

    // --------------------------------------------------
    // 3. Ensure this user has joined the session
    // --------------------------------------------------

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
        error: 'Join this attendance session before marking attendance.',
      });
    }

    // --------------------------------------------------
    // 4. Mark PRESENT
    // --------------------------------------------------
    //
    // Important:
    // attendance_records.organization_id is NOT NULL.
    // status is also NOT NULL.
    //

    const attendanceDate = new Date()
      .toISOString()
      .slice(0, 10);

    const result = await client.query(
      `
      INSERT INTO attendance_records (
        people_id,
        attendance_date,
        present,
        session_id,
        marked_by,
        marked_at,
        status,
        confirmed,
        organization_id
      )
      VALUES (
        $1,
        $2,
        true,
        $3,
        $4,
        NOW(),
        'present',
        false,
        $5
      )

      ON CONFLICT (
        organization_id,
        people_id,
        session_id
      )
      WHERE session_id IS NOT NULL

      DO UPDATE SET
        present = true,
        marked_by = EXCLUDED.marked_by,
        marked_at = NOW(),
        status = 'present',
        confirmed = false

      RETURNING id, marked_at
      `,
      [
        people_id,
        attendanceDate,
        session_id,
        userId,
        orgId,
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      attendance_id: result.rows[0].id,
      marked_at: result.rows[0].marked_at,
      marked_by: userId,
      person: person.rows[0],
    });

  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    console.error('[ATTENDANCE] Mark error:', err);

    return res.status(500).json({
      error: 'Could not mark attendance.',
    });
  } finally {
    client.release();
  }
});
