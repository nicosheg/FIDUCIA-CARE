import pool from '../../lib/db';
import { initiateFollowUpCall } from '../../utils/telephony/index.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const memberId = req.body.member_id;
  if (!memberId) return res.status(400).json({ error: 'Missing member_id' });

  // Fetch member from database
  const result = await pool.query('SELECT * FROM members WHERE id = $1', [memberId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Member not found' });

  const member = result.rows[0];
  if (!member.phone) return res.status(400).json({ error: 'Member has no phone number' });

  try {
    await initiateFollowUpCall(member, false);
    return res.status(200).json({ message: `Whatsapp message sent to ${member.first_name} ${member.last_name}` });
  } catch (err) {
    console.error('Test call error:', err);
    return res.status(500).json({ error: err.message });
  }
}
