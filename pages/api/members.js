import pool from '../../lib/db';

export default async function handler(req, res) {
  const churchId = req.query.church_id || req.body?.church_id;

  try {
    if (req.method === 'GET') {
      const result = await pool.query(
        `SELECT * FROM members WHERE church_id = $1 ORDER BY created_at DESC`,
        [churchId]
      );
      return res.status(200).json(result.rows);
    }

    if (req.method === 'POST') {
      const { first_name, last_name, phone, church_id } = req.body;
      const result = await pool.query(
        `INSERT INTO members (church_id, first_name, last_name, phone, status)
         VALUES ($1, $2, $3, $4, 'active')
         RETURNING *`,
        [church_id, first_name, last_name, phone]
      );
      return res.status(200).json(result.rows[0]);
    }

    res.status(405).end();
  } catch (err) {
    console.error('Direct DB error:', err);
    return res.status(500).json({ error: err.message });
  }
         }
