import pool from '../../../lib/db';

export default async function handler(req, res) {
  const groupId = req.query.group_id;
  const orgId = req.query.organization_id || 'demo-org';

  try {
    let rows;
    // Find the group name to check if it's "Everyone"
    const groupRes = await pool.query(`SELECT name FROM attendance_groups WHERE id = $1`, [groupId]);
    const groupName = groupRes.rows[0]?.name;

    if (groupName === 'Everyone') {
      const result = await pool.query(
        `SELECT id, first_name, phone, type, display_name FROM people WHERE organization_id = $1 AND status = 'active' ORDER BY display_name LIMIT 200`,
        [orgId]
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `SELECT id, first_name, phone, type, display_name FROM people WHERE organization_id = $1 AND status = 'active' AND (attendance_group_id = $2 OR attendance_group_id IS NULL) ORDER BY display_name LIMIT 200`,
        [orgId, groupId]
      );
      rows = result.rows;
    }

    res.status(200).json(rows);
  } catch (err) {
    console.error('People for group error:', err);
    res.status(500).json({ error: err.message });
  }
    }
