import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { name, sections, church_id } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sessionRes = await client.query(
      'INSERT INTO sessions (church_id, name, status) VALUES ($1, $2, $3) RETURNING id',
      [church_id, name, 'active']
    );
    const sessionId = sessionRes.rows[0].id;

    for (const secName of sections) {
      await client.query(
        'INSERT INTO session_sections (session_id, name) VALUES ($1, $2)',
        [sessionId, secName]
      );
    }

    await client.query('COMMIT');
    res.status(200).json({ id: sessionId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
                  }
