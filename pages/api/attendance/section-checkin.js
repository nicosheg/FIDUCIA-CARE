// pages/api/attendance/section-checkin.js
// Section-based present marking. Attendance only; participation is generated separately.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { session_id, section_name, present_ids } = req.body || {};
  if (!session_id || !section_name || !Array.isArray(present_ids)) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  const orgId = req.org.id;
  const userId = req.user.id;
  const client = await pool.connect();

  try {
    // Session must belong to this organization and be active.
    const session = await client.query(
      `SELECT id FROM sessions
       WHERE id=$1 AND organization_id=$2 AND status='active'
       LIMIT 1`,
      [session_id, orgId]
    );
    if (!session.rows.length) {
      return res.status(403).json({ error: 'Active session not found in your organization.' });
    }

    // Only assigned users may perform check-in.
    const assignment = await client.query(
      `SELECT 1 FROM session_users
       WHERE session_id=$1 AND user_id=$2
       LIMIT 1`,
      [session_id, userId]
    );
    if (!assignment.rows.length) {
      return res.status(403).json({ error: 'You are not assigned to this session.' });
    }

    // Section must belong to this session.
    const section = await client.query(
      `SELECT id FROM session_sections
       WHERE session_id=$1 AND name=$2
       LIMIT 1`,
      [session_id, section_name]
    );
    if (!section.rows.length) {
      return res.status(404).json({ error: 'Section not found' });
    }

    const sectionId = section.rows[0].id;
    const peopleIds = [...new Set(present_ids.filter(Boolean))];

    if (!peopleIds.length) {
      return res.status(200).json({ success: true, marked: 0 });
    }

    // Every person must belong to the same organization.
    const people = await client.query(
      `SELECT id FROM people
       WHERE organization_id=$1 AND id=ANY($2::uuid[])`,
      [orgId, peopleIds]
    );

    if (people.rows.length !== peopleIds.length) {
      return res.status(400).json({ error: 'One or more people are not in your organization.' });
    }

    const today = new Date().toISOString().slice(0, 10);

    await client.query('BEGIN');

    for (const peopleId of peopleIds) {
      await client.query(
        `INSERT INTO attendance_records
         (people_id,attendance_date,present,session_section_id)
         VALUES ($1,$2,true,$3)
         ON CONFLICT (people_id,attendance_date) DO UPDATE SET
           present=true,
           session_section_id=EXCLUDED.session_section_id`,
        [peopleId, today, sectionId]
      );
    }

    await client.query('COMMIT');
    return res.status(200).json({ success: true, marked: peopleIds.length });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[ATTENDANCE] Section check-in error:', err);
    return res.status(500).json({ error: 'Could not mark section attendance.' });
  } finally {
    client.release();
  }
});
