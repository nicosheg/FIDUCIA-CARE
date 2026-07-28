import { sendWhatsAppMessage } from '../../lib/messagingProviders';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { phone, first_name } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  // Check if the recipient is the business sender (can't send to itself)
  const businessPhone = process.env.META_BUSINESS_PHONE || '2349167049038'; // your production number
  if (phone.replace(/^\+/, '') === businessPhone) {
    return res.status(400).json({ error: 'Cannot send a test message to the business number itself. Please use a different recipient.' });
  }

  const message = `Havilah Christian Church\n\nHello ${first_name || 'Beloved'}, this is a test message from FIDUCIA CARE.\n\nIntelligence by FIDUCIA`;

  try {
    const messageId = await sendWhatsAppMessage(phone, message);
    // Meta returns a message ID if accepted
    return res.status(200).json({
      success: true,
      messageId,
      detail: `Message accepted by Meta (ID: ${messageId})`,
    });
  } catch (err) {
    // Return the exact Meta error to the frontend
    return res.status(500).json({
      success: false,
      error: err.message || 'Unknown error',
    });
  }
      }
