import pool from '../../../lib/db';
import { initiateFollowUpCall } from '../../../utils/telephony';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { session_id } = req.body;

  const client = await pool.connect();
  try {
    // Mark session closed
    await client.query('UPDATE sessions SET status = $1 WHERE id = $2', ['closed', session_id]);

    // Get today's attendance for this session
    const today = new Date().toISOString().slice(0, 10);
    const attendanceRes = await client.query(
      `SELECT m.id, m.first_name, m.phone, ar.present
       FROM members m
       LEFT JOIN attendance_records ar ON m.id = ar.member_id AND ar.attendance_date = $1
       WHERE m.church_id = 'demo-church' AND m.status = 'active'`,
      [today]
    );

    // Fetch all templates
    const tmplRes = await client.query(
      'SELECT category, body FROM message_templates WHERE church_id = $1',
      ['demo-church']
    );
    const templates = {};
    tmplRes.rows.forEach(r => { templates[r.category] = r.body; });

    let sent = 0;
    for (const member of attendanceRes.rows) {
      if (member.present) continue;
      // Simple classification (for demo, use first_absence; later add logic)
      const category = 'first_absence';
      const body = templates[category] || 'Hello {first_name}, we missed you.';
      const message = body.replace('{first_name}', member.first_name);

      try {
        await initiateFollowUpCall(
          { phone: member.phone, first_name: member.first_name },
          false,
          message
        );
        sent++;
      } catch (e) {
        console.error(`Failed to send to ${member.phone}:`, e.message);
      }
    }

    res.json({ success: true, processed: attendanceRes.rows.filter(r => !r.present).length, sent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
