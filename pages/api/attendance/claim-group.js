// pages/api/attendance/claim-group.js
import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { session_id, group_id, user_name } = req.body;
  if (!session_id || !group_id || !user_name) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    // Check if group already has an owner for this session
    const existing = await pool.query(
      `SELECT user_name FROM session_group_owners WHERE session_id = $1 AND group_id = $2`,
      [session_id, group_id]
    );

    if (existing.rows.length > 0) {
      const owner = existing.rows[0].user_name;
      if (owner === user_name) {
        return res.status(200).json({ claimed: true });
      }
      return res.status(200).json({ conflict: true, owner });
    }

    // Claim the group
    await pool.query(
      `INSERT INTO session_group_owners (session_id, group_id, user_name) VALUES ($1, $2, $3)`,
      [session_id, group_id, user_name]
    );

    return res.status(200).json({ claimed: true });
  } catch (err) {
    console.error('Claim group error:', err);
    return res.status(500).json({ error: err.message });
  }
  }
