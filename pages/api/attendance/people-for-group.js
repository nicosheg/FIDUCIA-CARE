// pages/api/attendance/people-for-group.js
// Returns active people belonging to an authenticated organization's attendance group.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const groupId = req.query.group_id;
  if (!groupId) return res.status(400).json({ error: 'Missing group_id' });

  const orgId = req.org.id;

  try {
    const group = await pool.query(
      `SELECT id, name FROM attendance_groups
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [groupId, orgId]
    );
    if (!group.rows.length) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    const isEveryone = group.rows[0].name === 'Everyone';
    const params = [orgId];
    let query;

    if (isEveryone) {
      query = `SELECT id, first_name, phone, type, display_name
               FROM people
               WHERE organization_id = $1 AND status = 'active'
               ORDER BY display_name
               LIMIT 200`;
    } else {
      query = `SELECT id, first_name, phone, type, display_name
               FROM people
               WHERE organization_id = $1
                 AND status = 'active'
                 AND (attendance_group_id = $2 OR attendance_group_id IS NULL)
               ORDER BY display_name
               LIMIT 200`;
      params.push(groupId);
    }

    const result = await pool.query(query, params);
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error('People for group error:', err);
    return res.status(500).json({ error: 'Could not load people for this group.' });
  }
});
