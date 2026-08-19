// pages/api/users/[id].js
import pool from '../../lib/db';
import { getAuthUser } from '../../lib/auth';

export default async function handler(req, res) {
    const authUser = await getAuthUser(req);
    if (!authUser) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing user ID' });

    const currentUserRes = await pool.query(
        `SELECT role, organization_id FROM users WHERE email = $1`,
        [authUser.email]
    );
    if (currentUserRes.rows.length === 0) {
        return res.status(403).json({ error: 'User not found' });
    }
    const currentUser = currentUserRes.rows[0];
    const orgId = currentUser.organization_id;

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
