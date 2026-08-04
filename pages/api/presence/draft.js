import pool from '../../../lib/db';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { person_id } = req.body;
  if (!person_id) return res.status(400).json({ error: 'Person ID required' });

  try {
    const personRes = await pool.query(`SELECT * FROM people WHERE id = $1`, [person_id]);
    if (personRes.rows.length === 0) return res.status(404).json({ error: 'Person not found' });
    const person = personRes.rows[0];

    const timelineRes = await pool.query(
      `SELECT * FROM timeline_events WHERE person_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [person_id]
    );

    let context = `Name: ${person.first_name}\nType: ${person.type || 'visitor'}\nLast seen: ${person.last_attended_date || 'Unknown'}\n`;
    if (timelineRes.rows.length > 0) {
      context += 'Recent interactions:\n';
      timelineRes.rows.forEach(e => {
        context += `- ${e.event_type}: ${e.description} (${e.created_at})\n`;
      });
    }

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: `You are ARIA, a warm AI assistant for FIDUCIA CARE. Write a short, personalised follow‑up message to a church member. Use the context provided. Keep it under 160 characters. Be warm, specific, and reference past interactions if available. Do not include placeholders.` },
          { role: 'user', content: context },
        ],
        temperature: 0.8, max_tokens: 200,
      }),
    });

    if (!response.ok) throw new Error('Groq API error');
    const data = await response.json();
    const draftMessage = data.choices[0].message.content.trim();

    await pool.query(
      `INSERT INTO timeline_events (person_id, organization_id, event_type, channel, description, metadata)
       VALUES ($1, 'demo-org', 'aria_draft', 'sms', $2, $3)`,
      [person_id, draftMessage, JSON.stringify({ type: 'draft' })]
    );

    return res.status(200).json({ message: draftMessage });
  } catch (error) {
    console.error('ARIA draft error:', error);
    return res.status(500).json({ error: error.message });
  }
      }
