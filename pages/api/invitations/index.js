// pages/api/invitations/index.js
// Invitation lifecycle for organization members.

import crypto from 'crypto';
import pool from '../../../lib/db';
import { withAdmin } from '../../../lib/apiHelpers';

function hashToken(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

async function handler(req, res) {
  const orgId = req.org.id;
  const currentUser = req.user;

  if (req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT
           i.id,
           i.name,
           i.role,
           i.created_at,
           i.expires_at,
           i.accepted_at,
           i.revoked_at,
           u.name AS created_by_name
         FROM invitations i
         LEFT JOIN users u
           ON u.id = i.created_by
         WHERE i.organization_id = $1
         ORDER BY i.created_at DESC`,
        [orgId]
      );

      return res.status(200).json(result.rows);
    } catch (err) {
      console.error('[INVITATIONS] List failed:', err);

      return res.status(500).json({
        error: 'Unable to load invitations.',
      });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({
        error: 'Missing invitation ID.',
      });
    }

    if (!['owner', 'admin'].includes(currentUser.role)) {
      return res.status(403).json({
        error: 'Only owners and admins can revoke invitations.',
      });
    }

    try {
      const result = await pool.query(
        `UPDATE invitations
         SET revoked_at = now()
         WHERE id = $1
           AND organization_id = $2
           AND accepted_at IS NULL
           AND revoked_at IS NULL
         RETURNING id`,
        [id, orgId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Invitation not found or already inactive.',
        });
      }

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      console.error('[INVITATIONS] Revoke failed:', err);

      return res.status(500).json({
        error: 'Unable to revoke invitation.',
      });
    }
  }

  return res.status(405).end();
}

export default withAdmin(handler);
