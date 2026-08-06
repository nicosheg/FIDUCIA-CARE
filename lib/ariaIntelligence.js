// lib/ariaIntelligence.js
import pool from './db';

export async function getAttentionItems(orgId) {
  const today = new Date().toISOString().slice(0, 10);

  // 1. People not contacted in the last 7 days
  const notContactedRes = await pool.query(
    `SELECT p.id, p.first_name, p.phone,
            (SELECT MAX(te.created_at) FROM timeline_events te
             WHERE te.person_id = p.id
               AND te.event_type IN ('message_sent','call','note','aria_draft'))
             AS last_contacted
     FROM people p
     WHERE p.organization_id = $1 AND p.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM timeline_events te
         WHERE te.person_id = p.id
           AND te.event_type IN ('message_sent','call','note','aria_draft')
           AND te.created_at > NOW() - INTERVAL '7 days'
       )
     ORDER BY last_contacted ASC NULLS FIRST
     LIMIT 10`,
    [orgId]
  );
  const notContacted = notContactedRes.rows;

  // 2. Prayer requests awaiting follow‑up (> 3 days)
  const prayerRes = await pool.query(
    `SELECT p.id, p.first_name, te.description AS prayer_request, te.created_at AS request_date
     FROM people p
     JOIN timeline_events te ON te.person_id = p.id
     WHERE p.organization_id = $1 AND p.status = 'active'
       AND te.event_type = 'prayer_request'
       AND te.created_at < NOW() - INTERVAL '3 days'
       AND NOT EXISTS (
         SELECT 1 FROM timeline_events te2
         WHERE te2.person_id = p.id
           AND te2.event_type IN ('message_sent','call','note')
           AND te2.created_at > te.created_at
       )
     ORDER BY te.created_at ASC
     LIMIT 5`,
    [orgId]
  );
  const prayerNeeds = prayerRes.rows;

  // 3. Birthdays this week
  const birthdaysRes = await pool.query(
    `SELECT p.id, p.first_name, p.metadata->>'birthday' AS birthday
     FROM people p
     WHERE p.organization_id = $1 AND p.status = 'active'
       AND p.metadata->>'birthday' IS NOT NULL
       AND TO_DATE(p.metadata->>'birthday', 'YYYY-MM-DD') BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`,
    [orgId]
  );
  const birthdays = birthdaysRes.rows;

  // 4. Absent 2+ Sundays
  const absentRes = await pool.query(
    `WITH recent AS (
       SELECT member_id, attendance_date, present,
              ROW_NUMBER() OVER (PARTITION BY member_id ORDER BY attendance_date DESC) AS rn
       FROM attendance_records
       WHERE attendance_date >= CURRENT_DATE - INTERVAL '28 days'
     ),
     streaks AS (
       SELECT member_id,
              COUNT(*) FILTER (WHERE present = false) AS consec_missed
       FROM recent WHERE rn <= 4
       GROUP BY member_id
     )
     SELECT p.id, p.first_name, s.consec_missed
     FROM people p
     JOIN streaks s ON p.id = s.member_id
     WHERE p.organization_id = $1 AND p.status = 'active' AND s.consec_missed >= 2
     ORDER BY s.consec_missed DESC
     LIMIT 5`,
    [orgId]
  );
  const absent = absentRes.rows;

  // Build prioritised items
  const highPriority = [];
  const mediumPriority = [];

  const longSilent = notContacted.filter(p => {
    if (!p.last_contacted) return true;
    return (new Date() - new Date(p.last_contacted)) > 10 * 24 * 3600 * 1000;
  });
  for (const p of longSilent) {
    highPriority.push(`${p.first_name} hasn't been contacted for a long time.`);
  }

  const oldPrayers = prayerNeeds.filter(p => (new Date() - new Date(p.request_date)) > 7 * 24 * 3600 * 1000);
  for (const p of oldPrayers) {
    highPriority.push(`${p.first_name} asked for prayer over a week ago.`);
  }

  for (const p of birthdays) {
    mediumPriority.push(`${p.first_name} has a birthday this week.`);
  }

  for (const p of absent) {
    mediumPriority.push(`${p.first_name} hasn't attended recently. May appreciate a follow-up.`);
  }

  const totalActive = await pool.query(
    `SELECT COUNT(*) AS cnt FROM people WHERE organization_id = $1 AND status = 'active'`,
    [orgId]
  );
  const total = parseInt(totalActive.rows[0].cnt) || 1;
  const absentRatio = absent.length / total;
  const contactRatio = (total - notContacted.length) / total;

  let health = 'healthy';
  if (absentRatio > 0.2 || contactRatio < 0.5) health = 'needs_attention';
  if (absentRatio > 0.4 || contactRatio < 0.3) health = 'urgent';

  return {
    highPriority,
    mediumPriority,
    health,
    stats: {
      total,
      notContactedCount: notContacted.length,
      prayerNeedsCount: prayerNeeds.length,
      birthdaysCount: birthdays.length,
      absentCount: absent.length,
    },
  };
    }
