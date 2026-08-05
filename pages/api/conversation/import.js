import pool from '../../../lib/db';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { person_id, text } = req.body;
  if (!person_id || !text) return res.status(400).json({ error: 'Missing person_id or text' });

  try {
    // 1. Store raw conversation as a single timeline event
    await pool.query(
      `INSERT INTO timeline_events (person_id, organization_id, event_type, channel, description, metadata)
       VALUES ($1, 'demo-org', 'conversation_import', 'manual', $2, $3)`,
      [person_id, text.substring(0, 500), JSON.stringify({ type: 'raw_import' })]
    );

    // 2. Use Groq to extract key insights
    const systemPrompt = `You are ARIA, an AI assistant for FIDUCIA CARE. You receive a raw conversation with a church member. Extract key events such as: prayer request, family update, birthday, sickness, emotional tone, promises, important dates. Return ONLY a JSON array of objects with fields: "type" (event type), "description" (short summary), "importance" (permanent, important, temporary).`;

    let extractedEvents = [];
    if (GROQ_API_KEY) {
      try {
        const response = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text.substring(0, 2000) }
            ],
            temperature: 0.2,
            max_tokens: 500,
          }),
        });
        const data = await response.json();
        const rawContent = data.choices[0].message.content.replace(/```json|```/g, '').trim();
        const arrayMatch = rawContent.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          extractedEvents = JSON.parse(arrayMatch[0]);
        }
      } catch (e) {
        console.error('Groq extraction failed, saving raw only:', e.message);
      }
    }

    // 3. Save extracted events to timeline
    for (const event of extractedEvents) {
      await pool.query(
        `INSERT INTO timeline_events (person_id, organization_id, event_type, channel, description, metadata)
         VALUES ($1, 'demo-org', $2, 'ai', $3, $4)`,
        [person_id, event.type || 'note', event.description || '', JSON.stringify({ importance: event.importance || 'temporary' })]
      );
    }

    res.status(200).json({ success: true, extracted: extractedEvents.length });
  } catch (err) {
    console.error('Conversation import error:', err);
    res.status(500).json({ error: err.message });
  }
       }
