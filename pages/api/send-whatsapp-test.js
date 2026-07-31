import { sendSMS } from '../../lib/messagingProviders/termii';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { phone, first_name } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  // AI-personalised message (for testing)
  const message = `Havilah Christian Church\n\nHello ${first_name || 'Beloved'}, this is a test message from FIDUCIA CARE.\n\nIntelligence by FIDUCIA`;

  try {
    const messageId = await sendSMS(phone, message);
    return res.status(200).json({ success: true, messageId, detail: `SMS sent (ID: ${messageId})` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
