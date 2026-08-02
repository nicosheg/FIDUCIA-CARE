import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method === 'GET' || req.method === 'POST') {
    try {
      await pool.query(`DROP TABLE IF EXISTS members CASCADE`);
      res.status(200).json({ message: 'members table dropped' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(405).end();
  }
  }
