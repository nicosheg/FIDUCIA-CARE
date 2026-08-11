import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { session_id, people_id, present, usher_id, group_id } = req.body;
  if (!session_id || !person_id) return res.status(400).json({ error: 'Missing fields' });

  const today = new Date().toISOString().slice(0, 10);
  const client = await pool.connect();
  try {
    // Upsert attendance record
    await client.query(
      `INSERT INTO attendance_records (people_id, attendance_date, present, session_section_id)
       VALUES ($1, $2, $3, (SELECT id FROM session_sections WHERE session_id = $4 LIMIT 1))
       ON CONFLICT (people_id, attendance_date) DO UPDATE SET present = $3`,
      [people_id, today, present, session_id]
    );

    // Log usher mark for progressive recognition
    if (usher_id) {
      await client.query(
        `INSERT INTO usher_marks (usher_id, people_id, session_id) VALUES ($1, $2, $3)`,
        [usher_id, people_id, session_id]
      );
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
       }
