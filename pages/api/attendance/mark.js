// pages/api/attendance/mark.js
import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { session_id, people_id, present, user_id, group_id } = req.body;
  if (!session_id || !people_id) return res.status(400).json({ error: 'Missing session_id or people_id' });

  const today = new Date().toISOString().slice(0, 10);
  const orgId = req.body.organization_id || 'demo-org'; // fallback

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Upsert attendance record
    await client.query(
      `INSERT INTO attendance_records (people_id, attendance_date, present, session_section_id)
       VALUES ($1, $2, $3, (SELECT id FROM session_sections WHERE session_id = $4 LIMIT 1))
       ON CONFLICT (people_id, attendance_date) DO UPDATE SET present = $3`,
      [people_id, today, present ? true : false, session_id]
    );

    // 2. Insert into participation_records (for ARIA intelligence)
    await client.query(
      `INSERT INTO participation_records (organization_id, person_id, participation_date, present, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (person_id, participation_date) DO NOTHING`,
      [orgId, people_id, today, present ? true : false]
    );

    // 3. Log user mark (if provided)
    if (user_id) {
      await client.query(
        `INSERT INTO user_marks (user_id, people_id, session_id) VALUES ($1, $2, $3)`,
        [user_id, people_id, session_id]
      );
    }

    await client.query('COMMIT');
    res.status(200).json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Mark error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
       }
