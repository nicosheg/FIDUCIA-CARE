import pool from '../../../lib/db';
import { generateChatCompletion } from '../../../lib/aiProvider';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { person_id } = req.body;
  if (!person_id) return res.status(400).json({ error: 'Person ID required' });

  try {
    // Fetch person
    const personRes = await pool.query(`SELECT * FROM people WHERE id = $1`, [person_id]);
    if (personRes.rows.length === 0) return res.status(404).json({ error: 'Person not found' });
    const person = personRes.rows[0];

    // Fetch recent timeline (last 10 events)
    const timelineRes = await pool.query(
      `SELECT * FROM timeline_events WHERE person_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [person_id]
    );
    const timeline = timelineRes.rows;

    // Fetch church profile
    const profileRes = await pool.query(
      `SELECT value FROM settings WHERE key = 'church_profile' AND organization_id = $1`,
      ['demo-org']
    );
    const profile = profileRes.rows.length > 0 ? profileRes.rows[0].value : { services: [], programs: [] };

    // Build context for the AI
    let context = `Name: ${person.first_name}\n`;
    context += `Type: ${person.type || 'visitor'}\n`;
    context += `Phone: ${person.phone || 'None'}\n`;

    if (profile.services?.length) {
      context += `Church services: ${profile.services.map(s => `${s.day} at ${s.time}`).join(', ')}\n`;
    }
    if (profile.programs?.length) {
      context += `Programs: ${profile.programs.map(p => p.name).join(', ')}\n`;
    }

    if (timeline.length > 0) {
      context += 'Recent timeline:\n';
      timeline.forEach(e => {
        context += `- [${e.event_type}] ${e.description} (${e.created_at})\n`;
      });
    }

    // Generate draft using the configured AI provider
    const systemPrompt = `You are ARIA, an assistant for FIDUCIA CARE. You write warm, personalised follow‑up messages to church members. Use the person's history, church schedule, and any recent interactions. Keep the message under 160 characters. Be specific and caring. Do not include placeholders.`;

    const draftMessage = await generateChatCompletion({
      systemPrompt,
      userPrompt: context,
      temperature: 0.8,
      max_tokens: 200,
    });

    // Save draft to timeline
    await pool.query(
      `INSERT INTO timeline_events (person_id, organization_id, event_type, channel, description, metadata)
       VALUES ($1, 'demo-org', 'aria_draft', 'sms', $2, $3)`,
      [person_id, draftMessage.trim(), JSON.stringify({ type: 'draft' })]
    );

    return res.status(200).json({ message: draftMessage.trim() });
  } catch (error) {
    console.error('ARIA draft error:', error);
    return res.status(500).json({ error: error.message });
  }
       }
