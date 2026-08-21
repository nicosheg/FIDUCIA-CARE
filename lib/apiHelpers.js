// lib/apiHelpers.js
import { getAuthUser, ensureCareUser } from './auth';
import pool from './db';

export function withOrg(handler) {
    return async (req, res) => {
        // 1. Validate Supabase token
        const authUser = await getAuthUser(req);
        if (!authUser) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // 2. Ensure FIDUCIA CARE profile exists (idempotent)
        await ensureCareUser(authUser);

        // 3. Fetch full profile with organization
        const result = await pool.query(
            `SELECT u.*, o.id as organization_id, o.name as organization_name
             FROM users u
             LEFT JOIN organizations o ON u.organization_id = o.id
             WHERE u.supabase_user_id = $1`,
            [authUser.id]
        );

        if (result.rows.length === 0) {
            return res.status(500).json({ error: 'Profile provisioning failed' });
        }

        const user = result.rows[0];

        // 4. Attach to request
        req.user = user;
        req.org = { id: user.organization_id, name: user.organization_name };

        // 5. Execute handler
        return handler(req, res);
    };
}

export function withAdmin(handler) {
    return withOrg(async (req, res) => {
        if (!['owner', 'admin'].includes(req.user.role)) {
            return res.status(403).json({ error: 'Admin permissions required' });
        }
        return handler(req, res);
    });
                   }
