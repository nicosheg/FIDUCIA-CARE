const token = process.env.META_ACCESS_TOKEN;
const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

/**
 * Remove non-printable/invisible Unicode characters from a string.
 */
function sanitise(str) {
  if (!str) return '';
  // Remove characters in the ranges: 200B‑200F (zero‑width spaces, LRM, RLM),
  // 2028‑2029 (line/paragraph separators), 2060 (word joiner), and other control chars.
  return str.replace(/[\u200B-\u200F\u2028\u2029\u2060\uFEFF]/g, '').trim();
}

export async function sendMessage(phone, message) {
  if (!token || !phoneNumberId) {
    throw new Error('Missing Meta credentials');
  }

  // Clean both the phone and message
  const cleanPhone = sanitise(phone).replace(/^\+/, '');
  const cleanMessage = sanitise(message);

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
        type: 'text',
        text: { body: cleanMessage },
      }),
    }
  );

  const data = await response.json();
  if (!data.messages) {
    throw new Error(data.error?.message || 'Unknown error');
  }
  return data.messages[0].id;
    }
