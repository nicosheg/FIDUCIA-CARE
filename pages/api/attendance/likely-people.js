import pool from '../../../lib/db';

export default async function handler(req, res) {
  const userId = req.query.user;
  const orgId = req.query.organization_id || 'demo-org';

  if (!userId) return res.status(400).json({ error: 'User ID required' });

  try {
    const result = await pool.query(
      `SELECT p.id, p.display_name, p.first_name, p.phone, p.type, COUNT(um.id) as mark_count
       FROM user_marks um
       JOIN people p ON um.people_id = p.id
       WHERE um.user_id = $1 AND p.organization_id = $2
       GROUP BY p.id
       ORDER BY mark_count DESC
       LIMIT 20`,
      [userId, orgId]
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Likely people error:', err);
    res.status(500).json({ error: err.message });
  }
}
