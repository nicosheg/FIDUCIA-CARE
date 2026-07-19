const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');

const app = express();
app.use(express.json());

// Use a persistent authentication session (stored in Render's disk)
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '/data/session' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  }
});

client.on('qr', (qr) => {
  console.log('QR_CODE:' + qr);  // We'll retrieve this once to set up the church phone
});

client.on('authenticated', () => {
  console.log('WhatsApp bridge authenticated!');
});

client.on('ready', () => {
  console.log('WhatsApp bridge is ready!');
});

client.initialize();

app.post('/send-message', async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });

  try {
    const numberId = await client.getNumberId(phone);
    if (!numberId) return res.status(404).json({ error: 'Number not found on WhatsApp' });
    const chat = await client.getChatById(numberId._serialized);
    await chat.sendMessage(message);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Bridge listening on port ${PORT}`));
