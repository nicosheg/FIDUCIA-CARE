import pool from '../../lib/db';

export default async function handler(req, res) {
  const orgId = req.query.organization_id || 'demo-org';

  try {
    // 1. People not contacted in the last 7 days (from timeline_events)
    const notContacted = await pool.query(`
      SELECT p.id, p.first_name, p.phone,
             (SELECT MAX(created_at) FROM timeline_events 
              WHERE person_id = p.id AND event_type IN ('message_sent','call','note')) AS last_contacted
      FROM people p
      WHERE p.organization_id = $1 AND p.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM timeline_events te 
          WHERE te.person_id = p.id 
            AND te.event_type IN ('message_sent','call','note') 
            AND te.created_at > NOW() - INTERVAL '7 days'
        )
      ORDER BY last_contacted ASC NULLS FIRST
      LIMIT 20
    `, [orgId]);

    // 2. Birthdays this week (if birthday column exists)
    const birthday = await pool.query(`
      SELECT id, first_name, phone, birthday
      FROM people
      WHERE birthday IS NOT NULL
        AND EXTRACT(MONTH FROM birthday) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(DAY FROM birthday) BETWEEN EXTRACT(DAY FROM CURRENT_DATE) 
                                          AND EXTRACT(DAY FROM CURRENT_DATE) + 7
    `);

    // 3. Open prayer requests (from timeline)
    const prayers = await pool.query(`
      SELECT DISTINCT p.id, p.first_name, p.phone, te.description
      FROM timeline_events te
      JOIN people p ON p.id = te.person_id
      WHERE te.event_type = 'prayer_request'
        AND te.created_at > NOW() - INTERVAL '7 days'
    `);

    // Build items array
    const items = [];
    notContacted.rows.forEach(p => {
      items.push({
        person_id: p.id,
        phone: p.phone,
        priority: 'medium',
        text: `${p.first_name} hasn't been contacted recently. Consider reaching out.`
      });
    });
    birthday.rows.forEach(p => {
      items.push({
        person_id: p.id,
        phone: p.phone,
        priority: 'high',
        text: `${p.first_name}'s birthday is coming up. Prepare a greeting.`
      });
    });
    prayers.rows.forEach(p => {
      items.push({
        person_id: p.id,
        phone: p.phone,
        priority: 'medium',
        text: `Follow up on prayer request: "${p.description}"`
      });
    });

    // Sort: high priority first, then by priority
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    items.sort((a, b) => (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4));

    res.status(200).json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
