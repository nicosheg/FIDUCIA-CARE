import pool from '../../../lib/db';

export default async function handler(req, res) {
  const personId = req.query.person_id;
  if (!personId) return res.status(400).json({ error: 'Missing person_id' });

  try {
    const personRes = await pool.query(`SELECT * FROM people WHERE id = $1`, [personId]);
    if (personRes.rows.length === 0) return res.status(404).json({ error: 'Person not found' });
    const person = personRes.rows[0];

    const actions = [];

    // 1. If they haven't been contacted recently, suggest a draft
    const lastContactedRes = await pool.query(
      `SELECT MAX(created_at) as last FROM timeline_events
       WHERE person_id = $1 AND event_type IN ('message_sent','call','note')`,
      [personId]
    );
    const lastContacted = lastContactedRes.rows[0]?.last;
    if (!lastContacted || (new Date() - new Date(lastContacted)) > 7 * 24 * 3600 * 1000) {
      actions.push({
        type: 'draft',
        label: 'Send a check‑in message',
        description: `${person.first_name} hasn't been contacted recently. ARIA can draft a warm follow‑up.`,
      });
    }

    // 2. If they missed the last two Sundays
    const absentRes = await pool.query(
      `SELECT COUNT(*) as missed FROM attendance_records
       WHERE member_id = $1 AND attendance_date >= CURRENT_DATE - INTERVAL '14 days' AND present = false`,
      [personId]
    );
    if (parseInt(absentRes.rows[0].missed) >= 2) {
      actions.push({
        type: 'followup',
        label: 'Check on their well‑being',
        description: `${person.first_name} hasn't attended recently. May appreciate a personal reach‑out.`,
      });
    }

    // 3. If they have a birthday this week
    const birthday = person.metadata?.birthday;
    if (birthday) {
      const today = new Date();
      const bday = new Date(birthday);
      const thisYearBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
      const diffDays = Math.ceil((thisYearBday - today) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays <= 7) {
        actions.push({
          type: 'birthday',
          label: 'Send a birthday greeting',
          description: `${person.first_name}'s birthday is coming up. A personal message would be wonderful.`,
        });
      }
    }

    // 4. If they have an open prayer request
    const prayerRes = await pool.query(
      `SELECT description FROM timeline_events
       WHERE person_id = $1 AND event_type = 'prayer_request'
       ORDER BY created_at DESC LIMIT 1`,
      [personId]
    );
    if (prayerRes.rows.length > 0) {
      actions.push({
        type: 'prayer',
        label: 'Follow up on prayer request',
        description: `They asked for prayer: "${prayerRes.rows[0].description}". Check how they're doing.`,
      });
    }

    res.status(200).json({ actions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
                                                       }
