import pool from '../../lib/db';

const templates = [
  "Hi {first_name}, we missed you at service today! Hope everything is well with you. 🙏",
  "Hey {first_name}, noticed you weren't with us yesterday. Just checking in – you are in our prayers.",
  "Hello {first_name}, we've been missing you lately. Let us know if there's anything we can do for you. ❤️",
];

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const personId = req.query.person_id;
  if (!personId) return res.status(400).json({ error: 'Person ID required' });

  try {
    const personRes = await pool.query(`SELECT first_name FROM people WHERE id = $1`, [personId]);
    if (personRes.rows.length === 0) return res.status(404).json({ error: 'Person not found' });
    const firstName = personRes.rows[0].first_name;

    let message = '';
    if (process.env.GROQ_API_KEY) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              { role: 'system', content: 'You are a caring AI assistant for a church community. Write a short, warm, personalized follow‑up message to a member who missed service. Use their first name. Keep it under 160 characters. Do not include any placeholders.' },
              { role: 'user', content: `Name: ${firstName}` },
            ],
            temperature: 0.8, max_tokens: 100,
          }),
        });
        const data = await groqRes.json();
        message = data.choices?.[0]?.message?.content?.trim() || '';
      } catch (e) {}
    }
    if (!message) {
      const tpl = templates[Math.floor(Math.random() * templates.length)];
      message = tpl.replace('{first_name}', firstName);
    }

    await pool.query(
      `INSERT INTO timeline_events (person_id, organization_id, event_type, channel, description, metadata)
       VALUES ($1, 'demo-org', 'ai_followup', 'sms', $2, '{"status":"generated"}')`,
      [personId, message]
    );
    res.json({ message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}
