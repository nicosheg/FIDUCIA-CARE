import pool from '../../lib/db';
import { sendSMS } from '../../lib/messagingProviders/termii';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { church_id } = req.body;
  const churchId = church_id || 'demo-church';

  try {
    // Get all active members with phone numbers
    const query = `
      SELECT DISTINCT m.id, m.first_name, m.phone
      FROM members m
      WHERE m.church_id = $1
        AND m.phone IS NOT NULL AND m.phone != ''
        AND m.status = 'active'
      ORDER BY m.first_name
    `;
    const { rows: members } = await pool.query(query, [churchId]);
    if (members.length === 0) {
      return res.status(200).json({ message: 'No members with phone numbers found.' });
    }

    const results = [];
    // Template message (can be customised later)
    const template = 'Dear {first_name}, thank you for worshipping with us at GIBEON 2026! We appreciate you.\n\n✨ Intelligence by FIDUCIA';

    for (const member of members) {
      const personalized = template.replace('{first_name}', member.first_name);
      try {
        const messageId = await sendSMS(member.phone, personalized);
        results.push({ phone: member.phone, status: 'sent', messageId });
      } catch (err) {
        results.push({ phone: member.phone, error: err.message, status: 'failed' });
      }
      // Termii's free trial may have rate limits; a 1‑second delay is safe
      await sleep(1000);
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status === 'failed').length;
    return res.status(200).json({ sent, failed, results });
  } catch (error) {
    console.error('Bulk SMS error:', error);
    return res.status(500).json({ error: error.message });
  }
  }
