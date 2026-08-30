// pages/api/attendance/create-session.js
// Canonical organization-scoped attendance session creation.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { name, sections } = req.body || {};

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({
      error: 'Session name required',
    });
  }

  if (sections !== undefined && !Array.isArray(sections)) {
    return res.status(400).json({
      error: 'sections must be an array',
    });
  }

  const cleanSections = Array.isArray(sections)
    ? [...new Set(
        sections
          .filter(s => typeof s === 'string')
          .map(s => s.trim())
          .filter(Boolean)
      )]
    : [];

  if (!cleanSections.length) {
    cleanSections.push('All');
  }

  const orgId = req.org.id;
  const userId = req.user.id;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create the attendance session.
    const sessionRes = await client.query(
      `INSERT INTO sessions (
         organization_id,
         name,
         status,
         started_by,
         started_at,
         created_at
       )
       VALUES ($1, $2, 'active', $3, NOW(), NOW())
       RETURNING id, name, status, started_at, created_at`,
      [orgId, name.trim(), userId]
    );

    const session = sessionRes.rows[0];

    // Create the sections belonging to this session.
    const createdSections = [];

    for (const sectionName of cleanSections) {
      const sectionRes = await client.query(
        `INSERT INTO session_sections (
           session_id,
           name,
           created_at,
           organization_id
         )
         VALUES ($1, $2, NOW(), $3)
         RETURNING id, name`,
        [session.id, sectionName, orgId]
      );

      createdSections.push(sectionRes.rows[0]);
    }

    await client.query('COMMIT');

    return res.status(200).json({
      id: session.id,
      name: session.name,
      status: session.status,
      started_at: session.started_at,
      sections: createdSections,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}

    console.error('[ATTENDANCE] Create session error:', err);

    return res.status(500).json({
      error: 'Could not create attendance session.',
    });
  } finally {
    client.release();
  }
}

export default withOrg(handler);
