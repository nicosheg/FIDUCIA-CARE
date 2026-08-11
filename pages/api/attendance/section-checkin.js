import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { session_id, section_name, present_ids } = req.body;
  if (!session_id || !section_name || !present_ids || !Array.isArray(present_ids)) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const client = await pool.connect();

  try {
    // Find section ID
    const secRes = await client.query(
      `SELECT id FROM session_sections WHERE session_id = $1 AND name = $2`,
      [session_id, section_name]
    );
    if (secRes.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }
    const sectionId = secRes.rows[0].id;

    // Insert/update attendance for each person
    for (const peopleId of present_ids) {
      await client.query(
        `INSERT INTO attendance_records (people_id, attendance_date, present, session_section_id)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (people_id, attendance_date) DO UPDATE SET present = true, session_section_id = $3`,
        [peopleId, today, sectionId]
      );
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Section checkin error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
    }
