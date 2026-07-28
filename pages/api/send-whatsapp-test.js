import { sendWhatsAppMessage } from '../../lib/messagingProviders';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { phone, first_name } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  try {
    // Use the approved template so it's allowed even for test-number cold sends
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${process.env.META_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.startsWith('+') ? phone.substring(1) : phone,
          type: 'template',
          template: {
            name: 'gebion_thank_you',
            language: { code: 'en_US' },
          },
        }),
      }
    );
    const data = await response.json();
    if (data.messages) {
      return res.status(200).json({ success: true, messageId: data.messages[0].id, detail: `Message accepted (ID: ${data.messages[0].id})` });
    } else {
      return res.status(500).json({ error: data.error?.message || 'Unknown error' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
          }
