import pool from '../../../lib/db';

export default async function handler(req, res) {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: 'Missing session_id' });

  try {
    const result = await pool.query(
      `SELECT
         COUNT(DISTINCT ar.people_id) FILTER (WHERE ar.present = true) as total_attended,
         COUNT(DISTINCT ar.people_id) FILTER (WHERE ar.present = true AND p.type = 'visitor') as visitors,
         COUNT(DISTINCT ar.people_id) FILTER (WHERE ar.present = true AND p.created_at::date = ar.marked_at::date AND p.type = 'visitor') as new_people,
         COUNT(DISTINCT ar.people_id) FILTER (WHERE ar.present = true AND p.last_contacted IS NULL) as needs_followup
       FROM attendance_records ar
       JOIN people p ON ar.people_id = p.id
       WHERE ar.session_id = $1`,
      [sessionId]
    );
    const row = result.rows[0];
    res.status(200).json({
      total_attended: parseInt(row.total_attended) || 0,
      visitors: parseInt(row.visitors) || 0,
      new_people: parseInt(row.new_people) || 0,
      needs_followup: parseInt(row.needs_followup) || 0,
    });
  } catch (err) {
    console.error('Summary error:', err);
    res.status(500).json({ error: err.message });
  }
  }
