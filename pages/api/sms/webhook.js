export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Verification challenge for Termii webhook (if required)
    const token = req.query.verify_token;
    if (token === process.env.TERMII_WEBHOOK_VERIFY_TOKEN) {
      return res.status(200).send(req.query.challenge || 'ok');
    }
    return res.sendStatus(403);
  }

  if (req.method === 'POST') {
    const body = req.body;
    console.log('Termii webhook received:', JSON.stringify(body));

    // Termii sends an array of statuses or a single object
    // Example: { "event": "sms.delivered", "data": { "message_id": "...", "phone_number": "...", "status": "Delivered" } }
    // or for incoming messages: { "event": "inbound", "data": { "message_id": "...", "phone_number": "...", "content": "Hello" } }

    // 1. Handle delivery status updates
    if (body.event === 'sms.delivered' || body.event === 'sms.failed') {
      const { message_id, phone_number, status } = body.data;
      // Update your follow_up_logs table or send a notification
      console.log(`SMS ${message_id} to ${phone_number} is now ${status}`);
    }

    // 2. Handle incoming replies (two‑way SMS)
    if (body.event === 'inbound') {
      const { phone_number, content } = body.data;
      console.log(`Incoming SMS from ${phone_number}: ${content}`);
      // Here you would run AI intent detection and auto‑reply or escalate
      // Example:
      // const intent = await classifyIntent(content);
      // if (intent === 'crisis') notifyPastor(phone_number, content);
      // else if (intent === 'sensitive') sendDraftToPastor(...);
      // else sendAutoReply(phone_number, 'Thank you for your message...');
    }

    return res.status(200).json({ status: 'ok' });
  }

  res.status(405).end();
}
