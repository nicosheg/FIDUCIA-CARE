import { generateChatCompletion } from '../../lib/aiProvider';
import pool from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { person_id, confirm } = req.body;
  if (!person_id) return res.status(400).json({ error: 'Missing person_id' });

  try {
    const personRes = await pool.query(`SELECT * FROM people WHERE id = $1`, [person_id]);
    if (personRes.rows.length === 0) return res.status(404).json({ error: 'Person not found' });
    const person = personRes.rows[0];

    // Fetch timeline and church profile
    const timelineRes = await pool.query(
      `SELECT * FROM timeline_events WHERE person_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [person_id]
    );
    const timeline = timelineRes.rows;
    const profileRes = await pool.query(
      `SELECT value FROM settings WHERE key = 'church_profile' AND organization_id = $1`,
      ['demo-org']
    );
    const profile = profileRes.rows.length > 0 ? profileRes.rows[0].value : { services: [], programs: [] };

    let context = `Name: ${person.first_name}\nType: ${person.type || 'visitor'}\nPhone: ${person.phone || 'None'}\n`;
    if (profile.services?.length) {
      context += `Church services: ${profile.services.map(s => `${s.day} at ${s.time}`).join(', ')}\n`;
    }
    if (profile.programs?.length) {
      context += `Programs: ${profile.programs.map(p => p.name).join(', ')}\n`;
    }
    if (timeline.length > 0) {
      context += 'Recent timeline:\n';
      timeline.forEach(e => { context += `- [${e.event_type}] ${e.description} (${e.created_at})\n`; });
    }

    const systemPrompt = `You are ARIA. Write a short, warm, personalised WhatsApp message. Keep it under 160 characters. Be specific and caring.`;
    const draftMessage = await generateChatCompletion({ systemPrompt, userPrompt: context, temperature: 0.8, max_tokens: 200 });

    // If confirm is true, record the message as sent
    if (confirm === true) {
      await pool.query(
        `INSERT INTO timeline_events (person_id, organization_id, event_type, channel, description, metadata)
         VALUES ($1, 'demo-org', 'message_sent', 'whatsapp', $2, $3)`,
        [person_id, draftMessage.trim(), JSON.stringify({ type: 'manual_send' })]
      );
      return res.status(200).json({ success: true });
    }

    // Otherwise, return the draft and wa.me link
    const phone = person.phone?.startsWith('+') ? person.phone.substring(1) : person.phone || '';
    const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(draftMessage.trim())}`;
    return res.status(200).json({ draft: draftMessage.trim(), wa_link: waLink });
  } catch (err) {
    console.error('Send WhatsApp error:', err);
    res.status(500).json({ error: err.message });
  }
      }
