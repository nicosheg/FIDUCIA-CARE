import pool from '../../../lib/db';

export default async function handler(req, res) {
  const orgId = req.query.organization_id || 'demo-org';
  const { rows } = await pool.query(
    `SELECT id, name FROM attendance_groups WHERE organization_id = $1 ORDER BY sort_order`,
    [orgId]
  );
  res.status(200).json(rows);
}
