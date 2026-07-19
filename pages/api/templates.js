import pool from '../../lib/db';

export default async function handler(req, res) {
  const churchId = req.query.church_id || req.body?.church_id;

  if (req.method === 'GET') {
    const result = await pool.query(
      'SELECT category, body FROM message_templates WHERE church_id = $1',
      [churchId]
    );
    const map = {};
    result.rows.forEach(r => { map[r.category] = r.body; });
    return res.json(map);
  }

  if (req.method === 'POST') {
    const { category, body } = req.body;
    await pool.query(
      `INSERT INTO message_templates (church_id, category, body)
       VALUES ($1, $2, $3)
       ON CONFLICT (church_id, category) DO UPDATE SET body = $3`,
      [churchId, category, body]
    );
    return res.json({ success: true });
  }
}
