const token = process.env.META_ACCESS_TOKEN;
const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

export async function sendMessage(phone, message) {
  if (!token || !phoneNumberId) {
    throw new Error('Missing Meta credentials');
  }

  // Remove the leading '+' if present – Meta API requires the number without it
  const cleanPhone = phone.startsWith('+') ? phone.substring(1) : phone;

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
        text: { body: message },
      }),
    }
  );

  const data = await response.json();
  if (!data.messages) {
    throw new Error(data.error?.message || 'Unknown error');
  }
  return data.messages[0].id;
}
