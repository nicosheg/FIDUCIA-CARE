// pages/api/users/[id].js
import pool from '../../../lib/db';
import { withAdmin } from '../../../lib/apiHelpers';

async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing user ID' });

  const orgId = req.org.id;
  const currentUser = req.user; // from withOrg

  // Verify target user belongs to the same org
  const targetRes = await pool.query(
    `SELECT role, organization_id FROM users WHERE id = $1`,
    [id]
  );
  if (targetRes.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  const targetUser = targetRes.rows[0];
  if (targetUser.organization_id !== orgId) {
    return res.status(403).json({ error: 'You do not have permission to access this user.' });
  }

  // PUT: update role (admin only)
  if (req.method === 'PUT') {
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'Missing role' });
    if (!['owner', 'admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (currentUser.role !== 'owner') {
      return res.status(403).json({ error: 'Only the organization owner can change roles.' });
    }

    if (role !== 'owner' && targetUser.role === 'owner') {
      const ownerCount = await pool.query(
        `SELECT COUNT(*) FROM users WHERE organization_id = $1 AND role = 'owner'`,
        [orgId]
      );
      if (parseInt(ownerCount.rows[0].count) === 1) {
        return res.status(400).json({ error: 'Cannot demote the only owner. Please assign another owner first.' });
      }
    }

    try {
      await pool.query(
        `UPDATE users SET role = $1 WHERE id = $2 AND organization_id = $3`,
        [role, id, orgId]
      );
      const updated = await pool.query(
        `SELECT id, organization_id, email, name, role, created_at, updated_at
         FROM users WHERE id = $1`,
        [id]
      );
      res.status(200).json(updated.rows[0]);
    } catch (err) {
      console.error('Error updating user:', err);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // DELETE: remove user (owner only)
  if (req.method === 'DELETE') {
    if (currentUser.role !== 'owner') {
      return res.status(403).json({ error: 'Only the organization owner can remove users.' });
    }

    if (targetUser.role === 'owner') {
      const ownerCount = await pool.query(
        `SELECT COUNT(*) FROM users WHERE organization_id = $1 AND role = 'owner'`,
        [orgId]
      );
      if (parseInt(ownerCount.rows[0].count) === 1) {
        return res.status(400).json({ error: 'Cannot delete the only owner.' });
      }
    }

    try {
      await pool.query(
        `DELETE FROM users WHERE id = $1 AND organization_id = $2`,
        [id, orgId]
      );
      res.status(200).json({ success: true });
    } catch (err) {
      console.error('Error deleting user:', err);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).end();
}

export default withAdmin(handler);
