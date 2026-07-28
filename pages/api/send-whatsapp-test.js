import { sendWhatsAppMessage } from '../../lib/messagingProviders';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { phone, first_name } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  // Use the approved template so it can be delivered even without prior conversation
  try {
    const messageId = await sendWhatsAppMessage(phone, `Havilah Christian Church\n\nHello ${first_name || 'Beloved'}, this is a test message from FIDUCIA CARE.\n\nIntelligence by FIDUCIA`);
    return res.status(200).json({ success: true, messageId, detail: `Message accepted by Meta (ID: ${messageId})` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
