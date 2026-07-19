import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { session_id, section_name, present_ids } = req.body;
  const today = new Date().toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    const secRes = await client.query(
      'SELECT id FROM session_sections WHERE session_id = $1 AND name = $2',
      [session_id, section_name]
    );
    if (secRes.rows.length === 0) return res.status(404).json({ error: 'Section not found' });
    const sectionId = secRes.rows[0].id;

    for (const memberId of present_ids) {
      await client.query(
        `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (member_id, attendance_date) DO UPDATE SET present = true, session_section_id = $3`,
        [memberId, today, sectionId]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
