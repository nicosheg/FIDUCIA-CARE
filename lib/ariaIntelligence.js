import pool from './db';

export async function getAttentionItems(orgId) {
  // 1. How many people have never been contacted?
  const neverContactedRes = await pool.query(
    `SELECT COUNT(*) AS cnt FROM people p
     WHERE p.organization_id = $1 AND p.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM timeline_events te
         WHERE te.person_id = p.id
           AND te.event_type IN ('message_sent','call','note','aria_draft')
       )`,
    [orgId]
  );
  const neverContacted = parseInt(neverContactedRes.rows[0].cnt) || 0;

  // 2. How many new visitors were added this week?
  const newVisitorsRes = await pool.query(
    `SELECT COUNT(*) AS cnt FROM people
     WHERE organization_id = $1 AND status = 'active'
       AND created_at > NOW() - INTERVAL '7 days'`,
    [orgId]
  );
  const newVisitors = parseInt(newVisitorsRes.rows[0].cnt) || 0;

  // 3. Open prayer requests (any prayer request that hasn't been followed up)
  const prayerRes = await pool.query(
    `SELECT COUNT(DISTINCT p.id) AS cnt
     FROM people p
     JOIN timeline_events te ON te.person_id = p.id
     WHERE p.organization_id = $1 AND p.status = 'active'
       AND te.event_type = 'prayer_request'
       AND NOT EXISTS (
         SELECT 1 FROM timeline_events te2
         WHERE te2.person_id = p.id
           AND te2.event_type IN ('message_sent','call','note')
           AND te2.created_at > te.created_at
       )`,
    [orgId]
  );
  const prayerNeeds = parseInt(prayerRes.rows[0].cnt) || 0;

  // 4. People who have missed the last two Sundays (using actual attendance records)
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
     SELECT COUNT(*) AS cnt
     FROM people p
     JOIN streaks s ON p.id = s.member_id
     WHERE p.organization_id = $1 AND p.status = 'active' AND s.consec_missed >= 2`,
    [orgId]
  );
  const absent = parseInt(absentRes.rows[0].cnt) || 0;

  // Build evidence‑based action items
  const items = [];
  if (neverContacted > 0) items.push(`${neverContacted} people have never been contacted.`);
  if (newVisitors > 0) items.push(`${newVisitors} new visitors were added this week.`);
  if (prayerNeeds > 0) items.push(`${prayerNeeds} prayer requests are waiting for follow‑up.`);
  if (absent > 0) items.push(`${absent} people haven't attended recently.`);
  if (items.length === 0) items.push('Everything looks healthy today.');

  return {
    items,
    neverContacted,
    newVisitors,
    prayerNeeds,
    absent,
  };
}
