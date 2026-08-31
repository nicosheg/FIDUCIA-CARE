// pages/api/attendance/section-checkin.js
// Canonical section attendance endpoint.
// Rules: active org-scoped session, assigned user, valid section/people,
// PRESENT-only records, required org/status fields, session-safe UPSERT.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session_id, section_name, present_ids } = req.body || {};
  if (!session_id || !section_name || !Array.isArray(present_ids)) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  const peopleIds = [...new Set(present_ids.filter(Boolean))];
  const orgId = req.org.id;
  const userId = req.user.id;
  const client = await pool.connect();

  try {
    // 1. Session must be active and belong to this organization.
    const session = await client.query(
      `SELECT id FROM sessions
       WHERE id=$1 AND organization_id=$2 AND status='active'
       LIMIT 1`,
      [session_id, orgId]
    );

    if (!session.rows.length) {
      return res.status(403).json({
        error: 'Active session not found in your organization.'
      });
    }

    // 2. User must be assigned to the session.
    const assignment = await client.query(
      `SELECT 1 FROM session_users
       WHERE session_id=$1 AND user_id=$2
       LIMIT 1`,
      [session_id, userId]
    );

    if (!assignment.rows.length) {
      return res.status(403).json({
        error: 'You are not assigned to this session.'
      });
    }

    // 3. Section must belong to this session and organization.
    const section = await client.query(
      `SELECT ss.id
       FROM session_sections ss
       JOIN sessions s ON s.id=ss.session_id
       WHERE ss.session_id=$1 AND ss.name=$2 AND s.organization_id=$3
       LIMIT 1`,
      [session_id, section_name, orgId]
    );

    if (!section.rows.length) {
      return res.status(404).json({ error: 'Section not found.' });
    }

    const sectionId = section.rows[0].id;

    // Empty submission is valid, but only after authorization above.
    if (!peopleIds.length) {
      return res.status(200).json({ success: true, marked: 0 });
    }

    // 4. Every person must belong to this organization and be active.
    const people = await client.query(
      `SELECT id FROM people
       WHERE organization_id=$1
         AND id=ANY($2::uuid[])
         AND COALESCE(status,'active')='active'`,
      [orgId, peopleIds]
    );

    if (people.rows.length !== peopleIds.length) {
      return res.status(403).json({
        error: 'One or more people are outside your organization or inactive.'
      });
    }

    const attendanceDate = new Date().toISOString().slice(0, 10);

    await client.query('BEGIN');

    // 5. Canonical PRESENT attendance record.
    // Uses the real unique constraint:
    // (organization_id, people_id, session_id)
    for (const peopleId of peopleIds) {
      await client.query(
        `INSERT INTO attendance_records (
           people_id, attendance_date, present, session_id,
           session_section_id, marked_by, marked_at, status,
           confirmed, organization_id
         )
         VALUES ($1,$2,true,$3,$4,$5,NOW(),'present',false,$6)
         ON CONFLICT (
           organization_id, people_id, session_id
         )
         WHERE session_id IS NOT NULL
         DO UPDATE SET
           present=true,
           session_section_id=EXCLUDED.session_section_id,
           marked_by=EXCLUDED.marked_by,
           marked_at=NOW(),
           status='present',
           confirmed=false`,
        [peopleId, attendanceDate, session_id, sectionId, userId, orgId]
      );
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      marked: peopleIds.length
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[ATTENDANCE] Section checkin error:', err);
    return res.status(500).json({
      error: 'Could not record section attendance.'
    });
  } finally {
    client.release();
  }
});
