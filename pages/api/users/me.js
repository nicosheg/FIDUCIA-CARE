// pages/api/users/me.js
import pool from '../../lib/db';
import { getAuthUser, getOrCreateCareUser } from '../../lib/auth';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const authUser = await getAuthUser(req);
    if (!authUser) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const careUser = await getOrCreateCareUser(authUser);
        if (!careUser) {
            return res.status(403).json({ error: 'User not found. Please contact your organization admin.' });
        }
        res.status(200).json(careUser);
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ error: err.message });
    }
}
