import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { organization_id, name, service_type, group_ids } = req.body;
  if (!name) return res.status(400).json({ error: 'Session name required' });

  const orgId = organization_id || 'demo-org';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Create session
    const sessionRes = await client.query(
      `INSERT INTO sessions (organization_id, name, status) VALUES ($1, $2, 'active') RETURNING id`,
      [orgId, name]
    );
    const sessionId = sessionRes.rows[0].id;

    // Link selected groups (if none provided, use all groups)
    let groups;
    if (group_ids && group_ids.length > 0) {
      groups = group_ids;
    } else {
      const allGroups = await client.query(
        `SELECT id FROM attendance_groups WHERE organization_id = $1 ORDER BY sort_order`,
        [orgId]
      );
      groups = allGroups.rows.map(r => r.id);
    }
    for (const gid of groups) {
      await client.query(
        `INSERT INTO session_groups (session_id, group_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [sessionId, gid]
      );
    }
    await client.query('COMMIT');
    res.status(200).json({ id: sessionId, groups });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
    }
