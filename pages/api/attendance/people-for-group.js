import pool from '../../../lib/db';

export default async function handler(req, res) {
  const groupId = req.query.group_id;
  const orgId = req.query.organization_id || 'demo-org';

  if (!groupId) {
    return res.status(400).json({ error: 'Missing group_id' });
  }

  try {
    // Find the group name to check if it's "Everyone"
    const groupRes = await pool.query(`SELECT name FROM attendance_groups WHERE id = $1`, [groupId]);
    if (groupRes.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }
    const groupName = groupRes.rows[0].name;

    let query;
    const params = [orgId];
    if (groupName === 'Everyone') {
      query = `SELECT id, first_name, phone, type, display_name
               FROM people
               WHERE organization_id = $1 AND status = 'active'
               ORDER BY display_name
               LIMIT 200`;
    } else {
      query = `SELECT id, first_name, phone, type, display_name
               FROM people
               WHERE organization_id = $1 AND status = 'active'
                 AND (attendance_group_id = $2 OR attendance_group_id IS NULL)
               ORDER BY display_name
               LIMIT 200`;
      params.push(groupId);
    }

    const result = await pool.query(query, params);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('People for group error:', err);
    res.status(500).json({ error: err.message });
  }
                          }
