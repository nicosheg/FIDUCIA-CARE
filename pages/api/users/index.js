// pages/api/users/index.js
import pool from '../../lib/db';
import { getAuthUser } from '../../lib/auth';

export default async function handler(req, res) {
    const authUser = await getAuthUser(req);
    if (!authUser) return res.status(401).json({ error: 'Unauthorized' });

    const currentUserRes = await pool.query(
        `SELECT role, organization_id FROM users WHERE email = $1`,
        [authUser.email]
    );
    if (currentUserRes.rows.length === 0) {
        return res.status(403).json({ error: 'User not found' });
    }
    const currentUser = currentUserRes.rows[0];
    const orgId = currentUser.organization_id;

    if (req.method === 'GET') {
        try {
            const result = await pool.query(
                `SELECT id, organization_id, email, name, role, created_at, updated_at
                 FROM users
                 WHERE organization_id = $1
                 ORDER BY created_at`,
                [orgId]
            );
            res.status(200).json(result.rows);
        } catch (err) {
            console.error('Error listing users:', err);
            res.status(500).json({ error: err.message });
        }
        return;
    }

    if (req.method === 'POST') {
        if (currentUser.role === 'user') {
            return res.status(403).json({ error: 'Only admins can invite users.' });
        }

        const { email, name, role } = req.body;
        if (!email || !name || !role) {
            return res.status(400).json({ error: 'Missing email, name, or role' });
        }
        if (!['owner', 'admin', 'user'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        if (role === 'owner' && currentUser.role !== 'owner') {
            return res.status(403).json({ error: 'Only the organization owner can assign owner role.' });
        }
        if (role === 'admin' && currentUser.role !== 'owner' && currentUser.role !== 'admin') {
            return res.status(403).json({ error: 'Only owners or admins can assign admin role.' });
        }

        try {
            const existing = await pool.query(
                `SELECT id FROM users WHERE email = $1 AND organization_id = $2`,
                [email, orgId]
            );
            if (existing.rows.length > 0) {
                return res.status(400).json({ error: 'User already exists in this organization.' });
            }

            const result = await pool.query(
                `INSERT INTO users (organization_id, email, name, role)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, organization_id, email, name, role, created_at, updated_at`,
                [orgId, email, name, role]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            console.error('Error creating user:', err);
            res.status(500).json({ error: err.message });
        }
        return;
    }

    res.status(405).end();
              }
