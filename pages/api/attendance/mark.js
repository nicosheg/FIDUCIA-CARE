import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { session_id, people_id, present, user_id, group_id } = req.body;
  if (!session_id || !people_id) return res.status(400).json({ error: 'Missing session_id or people_id' });

  const today = new Date().toISOString().slice(0, 10);
  const client = await pool.connect();
  try {
    // Upsert attendance record
    await client.query(
      `INSERT INTO attendance_records (people_id, attendance_date, present, session_section_id)
       VALUES ($1, $2, $3, (SELECT id FROM session_sections WHERE session_id = $4 LIMIT 1))
       ON CONFLICT (people_id, attendance_date) DO UPDATE SET present = $3`,
      [people_id, today, present ? true : false, session_id]
    );

    // Log user mark for progressive recognition (if user_id provided)
    if (user_id) {
      await client.query(
        `INSERT INTO user_marks (user_id, people_id, session_id) VALUES ($1, $2, $3)`,
        [user_id, people_id, session_id]
      );
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Mark error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
  }
