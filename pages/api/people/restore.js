import pool from '../../../lib/db';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { id } = req.body;
  await pool.query(`UPDATE people SET status='active', updated_at=now() WHERE id=$1`, [id]);
  res.status(200).json({ success: true });
}
