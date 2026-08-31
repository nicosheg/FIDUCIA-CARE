// pages/api/attendance/people.js

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
    });
  }

  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({
      error: 'session_id is required',
    });
  }

  const orgId = req.org.id;

  try {
    // Verify session belongs to organization.
    const session = await pool.query(
      `
      SELECT id
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
        error: 'Active attendance session not found.',
      });
    }

    const result = await pool.query(
      `
      SELECT
        p.id,
        p.first_name,
        p.last_name,
        p.display_name,
        p.phone,

        COALESCE(ar.present, false) AS marked,

        COALESCE(
          NULLIF(u.name, ''),
          NULLIF(
            CONCAT_WS(
              ' ',
              au.raw_user_meta_data->>'first_name',
              au.raw_user_meta_data->>'last_name'
            ),
            ''
          ),
          au.email
        ) AS marked_by_name

      FROM people p

      LEFT JOIN attendance_records ar
        ON ar.people_id = p.id
       AND ar.organization_id = $1
       AND ar.session_id = $2
       AND ar.present = true

      LEFT JOIN users u
        ON u.id = ar.marked_by

      LEFT JOIN auth.users au
        ON au.id = u.supabase_user_id

      WHERE p.organization_id = $1
        AND COALESCE(p.status, 'active') = 'active'

      ORDER BY
        COALESCE(
          NULLIF(p.display_name, ''),
          CONCAT_WS(' ', p.first_name, p.last_name)
        )
      `,
      [orgId, session_id]
    );

    return res.status(200).json(result.rows);

  } catch (err) {
    console.error(
      '[ATTENDANCE] People error:',
      err
    );

    return res.status(500).json({
      error: 'Could not load people.',
    });
  }
});
