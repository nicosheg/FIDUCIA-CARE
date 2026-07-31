const apiKey = process.env.TERMII_API_KEY;
const senderId = process.env.TERMII_SENDER_ID || 'FIDUCIA';
const baseUrl = process.env.TERMII_BASE_URL || 'https://v4.api.termii.com/';

/**
 * Sanitise a string to avoid hidden Unicode characters.
 */
function sanitise(str) {
  if (!str) return '';
  return str.replace(/[\u200B-\u200F\u2028\u2029\u2060\uFEFF]/g, '').trim();
}

/**
 * Send a single SMS via Termii.
 * @param {string} phone - recipient phone number (without +)
 * @param {string} message - the text body (max ~160 chars, can be longer with type="plain")
 * @param {object} options - e.g., { channel: 'dnd' } to use the transactional channel
 * @returns {Promise<string>} Termii message ID
 */
export async function sendSMS(phone, message, options = {}) {
  const cleanPhone = sanitise(phone).replace(/^\+/, '');
  const cleanMessage = sanitise(message);
  const channel = options.channel || 'dnd';   // transactional channel avoids DND restrictions

  if (!apiKey) throw new Error('Missing TERMII_API_KEY');

  const response = await fetch(`${baseUrl}sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      to: cleanPhone,
      from: senderId,
      sms: cleanMessage,
      type: 'plain',
      channel: channel,
    }),
  });

  const data = await response.json();
  if (data.code !== 'ok') {
    throw new Error(data.message || 'Termii API error');
  }
  // Termii returns a message_id or messageId
  return data.message_id || data.messageId || data.requestId;
}
