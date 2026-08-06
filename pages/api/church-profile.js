import pool from '../../lib/db';

export default async function handler(req, res) {
  const orgId = req.query.organization_id || req.body?.organization_id || 'demo-org';

  if (req.method === 'GET') {
    try {
      const { rows } = await pool.query(
        `SELECT value FROM settings WHERE key = 'church_profile' AND organization_id = $1`,
        [orgId]
      );
      if (rows.length === 0) return res.status(200).json({ services: [], programs: [], timezone: '' });
      return res.status(200).json(rows[0].value);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { services, programs, timezone } = req.body;
    const value = { services, programs, timezone };
    try {
      await pool.query(
        `INSERT INTO settings (organization_id, key, value) VALUES ($1, 'church_profile', $2)
         ON CONFLICT (organization_id, key) DO UPDATE SET value = $2`,
        [orgId, JSON.stringify(value)]
      );
      return res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
        }
