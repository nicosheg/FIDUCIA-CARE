// pages/api/attendance/create-session.js
// Creates an organization-scoped active attendance session.
// This flow intentionally does NOT depend on the legacy group tables.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { name } = req.body || {};

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Session name required' });
  }

  const orgId = req.org.id;
  const userId = req.user.id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

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

    await client.query('COMMIT');

    return res.status(200).json({
      id: session.id,
      name: session.name,
      status: session.status,
      started_at: session.started_at,
      created_at: session.created_at,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}

    console.error('[ATTENDANCE] Create session error:', err);

    return res.status(500).json({
      error: 'Could not create attendance session.',
    });
  } finally {
    client.release();
  }
}

export default withOrg(handler);
