import pool from '../../../lib/db';

export default async function handler(req, res) {
  const sessionId = req.query.session_id;
  const orgId = req.query.organization_id || 'demo-org';
  if (!sessionId) return res.status(400).json({ error: 'Missing session_id' });

  try {
    // Get all groups for this session
    const groupsRes = await pool.query(
      `SELECT g.id, g.name FROM attendance_groups g
       JOIN session_groups sg ON g.id = sg.group_id
       WHERE sg.session_id = $1`,
      [sessionId]
    );
    const groups = groupsRes.rows;

    const progress = {};
    for (const group of groups) {
      // Total people in this group (Everyone = all active)
      let totalQuery;
      if (group.name === 'Everyone') {
        totalQuery = `SELECT COUNT(*) as total FROM people WHERE organization_id = $1 AND status = 'active'`;
      } else {
        totalQuery = `SELECT COUNT(*) as total FROM people WHERE organization_id = $1 AND status = 'active' AND (attendance_group_id = $2 OR attendance_group_id IS NULL)`;
      }
      const totalRes = await pool.query(totalQuery, group.name === 'Everyone' ? [orgId] : [orgId, group.id]);
      const total = parseInt(totalRes.rows[0].total) || 0;

      // Marked present in this session (people in this group)
      let markedQuery;
      if (group.name === 'Everyone') {
        markedQuery = `SELECT COUNT(DISTINCT ar.people_id) as marked FROM attendance_records ar
                       JOIN people p ON ar.people_id = p.id
                       WHERE ar.session_id = $1 AND ar.present = true AND p.organization_id = $2 AND p.status = 'active'`;
      } else {
        markedQuery = `SELECT COUNT(DISTINCT ar.people_id) as marked FROM attendance_records ar
                       JOIN people p ON ar.people_id = p.id
                       WHERE ar.session_id = $1 AND ar.present = true AND p.organization_id = $2 AND p.status = 'active' AND (p.attendance_group_id = $3 OR p.attendance_group_id IS NULL)`;
      }
      const markedRes = await pool.query(markedQuery, group.name === 'Everyone' ? [sessionId, orgId] : [sessionId, orgId, group.id]);
      const marked = parseInt(markedRes.rows[0].marked) || 0;

      progress[group.id] = { total, marked };
    }

    res.status(200).json(progress);
  } catch (err) {
    console.error('Progress error:', err);
    res.status(500).json({ error: err.message });
  }
  }
