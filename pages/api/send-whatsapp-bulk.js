import pool from '../../lib/db';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { church_id } = req.body;
  const token = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const churchId = church_id || 'demo-church';

  if (!token || !phoneNumberId) {
    return res.status(500).json({ error: 'Missing Meta credentials' });
  }

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
    for (const member of members) {
      const cleanPhone = member.phone.startsWith('+') ? member.phone.substring(1) : member.phone;

      try {
        const response = await fetch(
          `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: cleanPhone,
              type: 'template',
              template: {
                name: 'gebion_thank_you',   // exact name from screenshot
                language: { code: 'en_US' },
              },
            }),
          }
        );

        const data = await response.json();
        if (data.messages) {
          results.push({ phone: member.phone, status: 'sent' });
        } else {
          results.push({ phone: member.phone, error: data.error?.message || 'Unknown', status: 'failed' });
        }
      } catch (err) {
        results.push({ phone: member.phone, error: err.message, status: 'failed' });
      }

      await sleep(3500); // 3.5 seconds between sends
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return res.status(200).json({ sent, failed, results });
  } catch (error) {
    console.error('Bulk WhatsApp error:', error);
    return res.status(500).json({ error: error.message });
  }
  }
