// pages/api/attendance/create-session.js
// Creates an organization-scoped active attendance session.
// The creator is automatically assigned to the session for
// compatibility with legacy attendance/group workflows.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  const {
    name,
    group_ids,
  } = req.body || {};

  if (
    typeof name !== 'string' ||
    !name.trim()
  ) {
    return res.status(400).json({
      error: 'Session name required',
    });
  }

  if (
    group_ids !== undefined &&
    !Array.isArray(group_ids)
  ) {
    return res.status(400).json({
      error: 'group_ids must be an array',
    });
  }

  const orgId = req.org.id;
  const userId = req.user.id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const sessionRes = await client.query(
      `INSERT INTO sessions
       (
         organization_id,
         name,
         status
       )
       VALUES ($1, $2, 'active')
       RETURNING id, name`,
      [
        orgId,
        name.trim(),
      ]
    );

    const sessionId =
      sessionRes.rows[0].id;

    /*
     * Assign the creator as a session user.
     * This prevents the old attendance endpoint from rejecting
     * the person who created the session.
     */
    await client.query(
      `INSERT INTO session_users
       (session_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [
        sessionId,
        userId,
      ]
    );

    let groups = [];

    if (
      Array.isArray(group_ids) &&
      group_ids.length
    ) {
      const uniqueIds = [
        ...new Set(
          group_ids.filter(Boolean)
        ),
      ];

      const validGroups =
        await client.query(
          `SELECT id
           FROM attendance_groups
           WHERE organization_id = $1
             AND id = ANY($2::uuid[])`,
          [
            orgId,
            uniqueIds,
          ]
        );

      if (
        validGroups.rows.length !==
        uniqueIds.length
      ) {
        throw new Error(
          'One or more attendance groups are invalid.'
        );
      }

      groups =
        validGroups.rows.map(
          row => row.id
        );
    } else {
      /*
       * Groups remain available for legacy functionality,
       * but the new Home attendance experience does not
       * require them.
       */
      const allGroups =
        await client.query(
          `SELECT id
           FROM attendance_groups
           WHERE organization_id = $1
           ORDER BY sort_order`,
          [orgId]
        );

      groups =
        allGroups.rows.map(
          row => row.id
        );
    }

    for (const groupId of groups) {
      await client.query(
        `INSERT INTO session_groups
         (session_id, group_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [
          sessionId,
          groupId,
        ]
      );
    }

    await client.query('COMMIT');

    return res.status(200).json({
      id: sessionId,
      name: sessionRes.rows[0].name,
      groups,
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
      error:
        'Could not create attendance session.',
    });
  } finally {
    client.release();
  }
}

export default withOrg(handler);
