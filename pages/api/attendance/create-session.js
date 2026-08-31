// FILE: pages/api/attendance/create-session.js
// Creates one organization-scoped active session, its sections, creator membership, and group assignments.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, sections } = req.body || {};
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Event name is required.' });
  }

  const requestedSections = Array.isArray(sections)
    ? [...new Set(sections.filter(s => typeof s === 'string').map(s => s.trim()).filter(Boolean))]
    : ['All'];

  const finalSections = requestedSections.length ? requestedSections : ['All'];
  const orgId = req.org.id;
  const userId = req.user.id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Enforce one active attendance session per organization.
    const existing = await client.query(
      `SELECT id,name,started_by,started_at
       FROM sessions
       WHERE organization_id = $1 AND status = 'active'
       ORDER BY started_at DESC
       LIMIT 1
       FOR UPDATE`,
      [orgId]
    );

    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'An attendance session is already active.',
        session: existing.rows[0],
      });
    }

    const created = await client.query(
      `INSERT INTO sessions (organization_id,name,status,started_by,started_at)
       VALUES ($1,$2,'active',$3,NOW())
       RETURNING id,name,status,started_by,started_at`,
      [orgId, name.trim(), userId]
    );

    const session = created.rows[0];

    // Creator automatically joins the session.
    await client.query(
      `INSERT INTO session_users (session_id,user_id)
       VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [session.id, userId]
    );

    // Create the sections requested by the session creator.
    for (const sectionName of finalSections) {
      await client.query(
        `INSERT INTO session_sections (session_id,name,organization_id)
         VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING`,
        [session.id, sectionName, orgId]
      );
    }

    // Preserve existing attendance-group functionality.
    const groups = await client.query(
      `SELECT id
       FROM attendance_groups
       WHERE organization_id = $1
       ORDER BY sort_order`,
      [orgId]
    );

    for (const group of groups.rows) {
      await client.query(
        `INSERT INTO session_groups (session_id,group_id)
         VALUES ($1,$2)
         ON CONFLICT DO NOTHING`,
        [session.id, group.id]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      id: session.id,
      session,
      sections: finalSections,
      joined: true,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[ATTENDANCE] Create session error:', err);
    return res.status(500).json({ error: 'Could not start attendance.' });
  } finally {
    client.release();
  }
});
