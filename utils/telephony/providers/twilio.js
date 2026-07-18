import twilio from 'twilio';

// WhatsApp Sandbox sender – same for all trial accounts
const WHATSAPP_SANDBOX_FROM = 'whatsapp:+14155238886';

/**
 * Sends a WhatsApp message via Twilio Sandbox.
 * @param {Object} member - Member object with `phone` and `first_name`
 * @param {boolean} escalate - (unused, kept for interface compatibility)
 * @returns {string} message SID
 */
export async function placeCall(member, escalate = false) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  const messageBody = `⛪ *Havilah Christian Church* \n\n` +
    `Hello ${member.first_name}, we noticed you were absent from service recently and wanted to reach out. ` +
    `You are deeply valued by your church family. We hope to see you next week! Have a blessed day. 🙏`;

  const message = await client.messages.create({
    from: WHATSAPP_SANDBOX_FROM,          // Twilio sandbox number
    to: `whatsapp:${member.phone}`,       // target phone, must be sandbox-whitelisted
    body: messageBody,
  });

  console.log(`WhatsApp message sent. SID: ${message.sid}`);
  return message.sid;
                                             }
