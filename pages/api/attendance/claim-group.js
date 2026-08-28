// pages/api/attendance/claim-group.js
// Assigns one attendance group to one user for a session.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { session_id, group_id, user_name } = req.body || {};
  if (!session_id || !group_id || !user_name) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const orgId = req.org.id;
  const client = await pool.connect();

  try {
    // Session must belong to this organization.
    const session = await client.query(
      `SELECT id FROM sessions
       WHERE id=$1 AND organization_id=$2 AND status='active'
       LIMIT 1`,
      [session_id, orgId]
    );

    if (!session.rows.length) {
      return res.status(403).json({ error: 'Active session not found in your organization.' });
    }

    // Group must belong to this organization and be attached to this session.
    const group = await client.query(
      `SELECT ag.id
       FROM attendance_groups ag
       JOIN session_groups sg ON sg.group_id=ag.id
       WHERE ag.id=$1 AND ag.organization_id=$2 AND sg.session_id=$3
       LIMIT 1`,
      [group_id, orgId, session_id]
    );

    if (!group.rows.length) {
      return res.status(403).json({ error: 'Group is not available for this session.' });
    }

    const existing = await client.query(
      `SELECT user_name FROM session_group_owners
       WHERE session_id=$1 AND group_id=$2
       LIMIT 1`,
      [session_id, group_id]
    );

    if (existing.rows.length) {
      const owner = existing.rows[0].user_name;
      if (owner === user_name) {
        return res.status(200).json({ claimed: true });
      }
      return res.status(200).json({ conflict: true, owner });
    }

    try {
      await client.query(
        `INSERT INTO session_group_owners
         (session_id,group_id,user_name)
         VALUES ($1,$2,$3)`,
        [session_id, group_id, user_name.trim()]
      );
    } catch (err) {
      // Protect against two users claiming simultaneously.
      if (err.code !== '23505') throw err;

      const owner = await client.query(
        `SELECT user_name FROM session_group_owners
         WHERE session_id=$1 AND group_id=$2
         LIMIT 1`,
        [session_id, group_id]
      );

      return res.status(200).json({
        conflict: true,
        owner: owner.rows[0]?.user_name || 'Another user',
      });
    }

    return res.status(200).json({ claimed: true });
  } catch (err) {
    console.error('[ATTENDANCE] Claim group error:', err);
    return res.status(500).json({ error: 'Could not claim group.' });
  } finally {
    client.release();
  }
}

export default withOrg(handler);
