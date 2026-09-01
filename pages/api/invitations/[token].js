// pages/api/invitations/[token].js
// Public invitation lookup.
// Accepting the invitation happens through authenticated
// account provisioning.

import crypto from 'crypto';
import pool from '../../../lib/db';

function hashToken(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      error: 'Invalid invitation link.',
    });
  }

  const tokenHash = hashToken(token);

  if (req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT
           i.id,
           i.name,
           i.role,
           i.expires_at,
           i.accepted_at,
           i.revoked_at,
           o.name AS organization_name
         FROM invitations i
         INNER JOIN organizations o
           ON o.id = i.organization_id
         WHERE i.token_hash = $1
         LIMIT 1`,
        [tokenHash]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'This invitation link is not valid.',
        });
      }

      const invitation = result.rows[0];

      if (invitation.revoked_at) {
        return res.status(410).json({
          error: 'This invitation has been revoked.',
        });
      }

      if (invitation.accepted_at) {
        return res.status(410).json({
          error: 'This invitation has already been used.',
        });
      }

      if (
        invitation.expires_at &&
        new Date(invitation.expires_at) <= new Date()
      ) {
        return res.status(410).json({
          error: 'This invitation has expired.',
        });
      }

      return res.status(200).json({
        invitation: {
          name: invitation.name,
          role: invitation.role,
          organization_name: invitation.organization_name,
          expires_at: invitation.expires_at,
        },
      });
    } catch (err) {
      console.error('[INVITATIONS] Preview failed:', err);

      return res.status(500).json({
        error: 'Unable to open this invitation.',
      });
    }
  }

  return res.status(405).end();
}
