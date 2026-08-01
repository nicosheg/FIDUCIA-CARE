export async function sendSMS(phone, message) {
  console.log(`[MOCK SMS] To: ${phone} | Message: ${message}`);
  return `mock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
