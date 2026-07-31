import fetch from 'node-fetch'; // if using Node <18; Next.js already has fetch

const apiKey = process.env.TERMII_API_KEY;
const senderId = process.env.TERMII_SENDER_ID || 'Termii'; // default sender if none set
const baseUrl = process.env.TERMII_BASE_URL || 'https://v4.api.termii.com/';

function sanitise(str) {
  if (!str) return '';
  return str.replace(/[\u200B-\u200F\u2028\u2029\u2060\uFEFF]/g, '').trim();
}

export async function sendSMS(phone, message, options = {}) {
  const cleanPhone = sanitise(phone).replace(/^\+/, '');
  const cleanMessage = sanitise(message);
  const channel = options.channel || 'dnd';

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

  // Termii v4 returns { message_id, message, balance, user } on success
  if (!data.message_id) {
    throw new Error(data.message || 'Termii API error');
  }
  return data.message_id;
    }
