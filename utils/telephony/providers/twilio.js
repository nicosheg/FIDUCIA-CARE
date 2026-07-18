import twilio from 'twilio';
import { supabaseAdmin } from '../../../lib/supabaseClient'; // adjust path if needed

export async function placeCall(member, escalate = false) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  // Fetch the call script from settings
  const { data: setting } = await supabaseAdmin
    .from('settings')
    .select('value')
    .eq('key', 'call_script')
    .single();

  const script = setting?.value || {
    greeting: "Hello {first_name}, this is Nicholas from your church, Havilah Christian Church.",
    body: "We missed you today. Are you doing okay?",
    prayer: "Would you like us to pray with you?",
    closing: "Thank you. We look forward to seeing you soon. God bless you.",
  };

  // Replace placeholder with member's name
  const replace = (text) => text.replace('{first_name}', member.first_name);

  const twiml = `
    <Response>
      <Say voice="Polly.Joanna">${replace(script.greeting)}</Say>
      <Say voice="Polly.Joanna">${replace(script.body)}</Say>
      <Gather input="speech dtmf" numDigits="1" action="/api/call/response?member_id=${member.id}" timeout="5">
        <Say voice="Polly.Joanna">${replace(script.prayer)}</Say>
      </Gather>
      <Say voice="Polly.Joanna">${replace(script.closing)}</Say>
    </Response>
  `;

  const call = await client.calls.create({
    twiml,
    to: member.phone,
    from: process.env.TWILIO_PHONE_NUMBER,
    timeLimit: 180,
    statusCallback: `/api/call/status?member_id=${member.id}`,
    statusCallbackEvent: ['completed', 'no-answer'],
  });

  return call.sid;
    }
