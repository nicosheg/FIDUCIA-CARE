import { sendSMS } from './mock.js';   // change to './termii.js' when live

// Switch to another provider by changing the import above
export async function sendWhatsAppMessage(phone, message) {
  return await sendSMS(phone, message);
}
