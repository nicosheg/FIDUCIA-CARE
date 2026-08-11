import pool from '../../../lib/db';

export default async function handler(req, res) {
  const orgId = req.query.organization_id || 'demo-org';
  try {
    const result = await pool.query(
      `SELECT id, name FROM sessions WHERE organization_id = $1 AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
      [orgId]
    );
    if (result.rows.length === 0) return res.status(200).json({ active: false });
    res.status(200).json({ active: true, session_id: result.rows[0].id, name: result.rows[0].name });
  } catch (err) {
    console.error('Active session error:', err);
    res.status(500).json({ error: err.message });
  }
      }
