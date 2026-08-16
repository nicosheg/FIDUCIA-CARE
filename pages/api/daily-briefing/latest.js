// pages/api/daily-briefing/latest.js
import pool from '../../../lib/db';

export default async function handler(req, res) {
  const orgId = req.query.organization_id || 'demo-org';
  const briefRes = await pool.query(
    `SELECT * FROM daily_briefings WHERE organization_id = $1 ORDER BY generated_at DESC LIMIT 1`,
    [orgId]
  );
  if (briefRes.rows.length === 0) {
    return res.status(404).json({ error: 'No briefing found' });
  }
  res.status(200).json(briefRes.rows[0]);
    }
