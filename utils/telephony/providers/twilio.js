import twilio from 'twilio';

export async function placeCall(member, escalate = false) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  // Initial TwiML: greet and first gather
  const twiml = `
    <Response>
      <Say voice="Polly.Joanna">
        Hello ${member.first_name}, this is Nicholas from your church, Havilah Christian Church.
        We missed seeing you during today’s service and wanted to check on you. Are you doing okay?
      </Say>
      <Gather
        input="speech"
        action="/api/call/response?member_id=${member.id}&turn=1"
        timeout="5"
        speechTimeout="2"
        language="en-US"
      />
      <Say>I didn’t catch that. We’ll try again later. God bless you.</Say>
    </Response>
  `;

  const call = await client.calls.create({
    twiml,
    to: member.phone,
    from: process.env.TWILIO_PHONE_NUMBER,
    timeLimit: 180,               // 3 minutes max (in seconds)
    statusCallback: `/api/call/status?member_id=${member.id}`,
    statusCallbackEvent: ['completed', 'no-answer'],
  });

  return call.sid;
}
