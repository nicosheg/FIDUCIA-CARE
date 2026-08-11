// lib/ariaIntelligence.js
import pool from './db';

export async function getAttentionItems(orgId) {
  // 1. People not contacted in the last 7 days
  const notContactedRes = await pool.query(
    `SELECT p.id, p.first_name,
            (SELECT MAX(te.created_at) FROM timeline_events te
             WHERE te.people_id = p.id
               AND te.event_type IN ('message_sent','call','note','aria_draft')) AS last_contacted
     FROM people p
     WHERE p.organization_id = $1 AND p.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM timeline_events te
         WHERE te.people_id = p.id
           AND te.event_type IN ('message_sent','call','note','aria_draft')
           AND te.created_at > NOW() - INTERVAL '7 days'
       )
     ORDER BY last_contacted ASC NULLS FIRST
     LIMIT 10`,
    [orgId]
  );

  // 2. Prayer requests awaiting follow‑up (> 3 days since last prayer request)
  const prayerRes = await pool.query(
    `SELECT p.id, p.first_name, te.description AS prayer_request, te.created_at AS request_date
     FROM people p
     JOIN timeline_events te ON te.people_id = p.id
     WHERE p.organization_id = $1 AND p.status = 'active'
       AND te.event_type = 'prayer_request'
       AND te.created_at < NOW() - INTERVAL '3 days'
       AND NOT EXISTS (
         SELECT 1 FROM timeline_events te2
         WHERE te2.people_id = p.id
           AND te2.event_type IN ('message_sent','call','note')
           AND te2.created_at > te.created_at
       )
     ORDER BY te.created_at ASC
     LIMIT 5`,
    [orgId]
  );

  // 3. Birthdays this week
  const birthdaysRes = await pool.query(
    `SELECT p.id, p.first_name, p.metadata->>'birthday' AS birthday
     FROM people p
     WHERE p.organization_id = $1 AND p.status = 'active'
       AND p.metadata->>'birthday' IS NOT NULL
       AND TO_DATE(p.metadata->>'birthday', 'YYYY-MM-DD') BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`,
    [orgId]
  );

  // 4. People who missed the last 2 Sundays (or any sessions)
  const absentRes = await pool.query(
    `WITH recent AS (
       SELECT people_id, attendance_date, present,
              ROW_NUMBER() OVER (PARTITION BY people_id ORDER BY attendance_date DESC) AS rn
       FROM attendance_records
       WHERE attendance_date >= CURRENT_DATE - INTERVAL '28 days'
     ),
     streaks AS (
       SELECT people_id,
              COUNT(*) FILTER (WHERE present = false) AS consec_missed
       FROM recent WHERE rn <= 4
       GROUP BY people_id
     )
     SELECT p.id, p.first_name, s.consec_missed
     FROM people p
     JOIN streaks s ON p.id = s.people_id
     WHERE p.organization_id = $1 AND p.status = 'active' AND s.consec_missed >= 2
     ORDER BY s.consec_missed DESC
     LIMIT 5`,
    [orgId]
  );

  // Build items array
  const items = [];

  // Not contacted
  for (const p of notContactedRes.rows) {
    items.push({ people_id: p.id, text: `${p.first_name} hasn't been contacted for a long time.` });
  }

  // Prayer needs
  for (const p of prayerRes.rows) {
    items.push({ people_id: p.id, text: `${p.first_name} asked for prayer over a week ago.` });
  }

  // Birthdays
  for (const p of birthdaysRes.rows) {
    items.push({ people_id: p.id, text: `${p.first_name} has a birthday this week.` });
  }

  // Absent
  for (const p of absentRes.rows) {
    items.push({ people_id: p.id, text: `${p.first_name} hasn't attended recently. May appreciate a follow-up.` });
  }

  // If nothing, return a calm message
  if (items.length === 0) {
    items.push({ people_id: null, text: 'Everyone is well taken care of today.' });
  }

  return { items };
}
