// pages/api/users/[id].js
// Organization member management.
// Ownership is transferred, never duplicated.

import pool from '../../../lib/db';
import { withAdmin } from '../../../lib/apiHelpers';

async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      error: 'Missing user ID.',
    });
  }

  const orgId = req.org.id;
  const currentUser = req.user;

  const targetRes = await pool.query(
    `SELECT
       id,
       organization_id,
       role,
       name,
       email
     FROM users
     WHERE id = $1`,
    [id]
  );

  if (targetRes.rows.length === 0) {
    return res.status(404).json({
      error: 'User not found.',
    });
  }

  const targetUser = targetRes.rows[0];

  if (targetUser.organization_id !== orgId) {
    return res.status(403).json({
      error: 'You do not have permission to access this user.',
    });
  }

  /*
   * ------------------------------------------------------------
   * PUT
   * ------------------------------------------------------------
   *
   * Change role / transfer ownership.
   */
  if (req.method === 'PUT') {
    const { role } = req.body || {};

    if (!['owner', 'admin', 'user'].includes(role)) {
      return res.status(400).json({
        error: 'Invalid role.',
      });
    }

    /*
     * Only the current owner can transfer ownership.
     */
    if (role === 'owner') {
      if (currentUser.role !== 'owner') {
        return res.status(403).json({
          error: 'Only the current owner can transfer ownership.',
        });
      }

      if (targetUser.role === 'owner') {
        return res.status(400).json({
          error: 'This person is already the owner.',
        });
      }

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        /*
         * Transfer ownership atomically:
         *
         * current owner -> admin
         * target member -> owner
         *
         * We use a temporary role to avoid the
         * one-owner unique index during the transaction.
         */
        await client.query(
          `UPDATE users
           SET role = 'admin',
               updated_at = now()
           WHERE id = $1
             AND organization_id = $2
             AND role = 'owner'`,
          [currentUser.id, orgId]
        );

        await client.query(
          `UPDATE users
           SET role = 'owner',
               updated_at = now()
           WHERE id = $1
             AND organization_id = $2`,
          [id, orgId]
        );

        await client.query('COMMIT');

        const updated = await pool.query(
          `SELECT
             id,
             organization_id,
             email,
             name,
             role,
             active,
             created_at,
             updated_at,
             last_login_at
           FROM users
           WHERE id = $1`,
          [id]
        );

        return res.status(200).json({
          success: true,
          transferred: true,
          user: updated.rows[0],
        });
      } catch (err) {
        await client.query('ROLLBACK');

        console.error(
          '[USERS] Ownership transfer failed:',
          err
        );

        return res.status(500).json({
          error: 'Unable to transfer ownership.',
        });
      } finally {
        client.release();
      }
    }

    /*
     * Only owner can change normal roles.
     */
    if (currentUser.role !== 'owner') {
      return res.status(403).json({
        error: 'Only the organization owner can change roles.',
      });
    }

    /*
     * Prevent the current owner from accidentally
     * removing ownership without transferring it.
     */
    if (
      targetUser.role === 'owner' &&
      role !== 'owner'
    ) {
      return res.status(400).json({
        error:
          'Ownership must be transferred to another member before this owner can be demoted.',
      });
    }

    try {
      const updated = await pool.query(
        `UPDATE users
         SET role = $1,
             updated_at = now()
         WHERE id = $2
           AND organization_id = $3
         RETURNING
           id,
           organization_id,
           email,
           name,
           role,
           active,
           created_at,
           updated_at,
           last_login_at`,
        [role, id, orgId]
      );

      return res.status(200).json(updated.rows[0]);
    } catch (err) {
      console.error('[USERS] Error updating role:', err);

      return res.status(500).json({
        error: 'Unable to update member role.',
      });
    }
  }

  /*
   * ------------------------------------------------------------
   * DELETE
   * ------------------------------------------------------------
   *
   * Admins and owners can remove members.
   *
   * Ownership itself must be transferred first.
   */
  if (req.method === 'DELETE') {
    if (!['owner', 'admin'].includes(currentUser.role)) {
      return res.status(403).json({
        error: 'Only owners and admins can remove users.',
      });
    }

    /*
     * Nobody can remove the current owner.
     */
    if (targetUser.role === 'owner') {
      return res.status(400).json({
        error:
          'The owner cannot be removed. Transfer ownership first.',
      });
    }

    /*
     * An admin cannot remove another admin.
     *
     * This keeps admin power balanced while the owner
     * remains the final authority.
     */
    if (
      currentUser.role === 'admin' &&
      targetUser.role === 'admin'
    ) {
      return res.status(403).json({
        error: 'Admins cannot remove other admins.',
      });
    }

    try {
      await pool.query(
        `DELETE FROM users
         WHERE id = $1
           AND organization_id = $2`,
        [id, orgId]
      );

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      console.error('[USERS] Error deleting user:', err);

      return res.status(500).json({
        error: 'Unable to remove user.',
      });
    }
  }

  return res.status(405).end();
}

export default withAdmin(handler);
