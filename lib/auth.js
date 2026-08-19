// lib/auth.js
import { supabase } from './supabaseClient';
import pool from './db';

export async function getAuthUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.replace('Bearer ', '');
    if (!token) return null;
    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return null;
        return user;
    } catch {
        return null;
    }
}

export async function getCurrentCareUser(req) {
    const authUser = await getAuthUser(req);
    if (!authUser) return null;

    const result = await pool.query(
        `SELECT u.*, o.id as organization_id, o.name as organization_name
         FROM users u
         LEFT JOIN organizations o ON u.organization_id = o.id
         WHERE u.supabase_user_id = $1`,
        [authUser.id]
    );
    if (result.rows.length === 0) return null;
    return result.rows[0];
}

export async function getCurrentOrganization(req) {
    const user = await getCurrentCareUser(req);
    if (!user) return null;
    return {
        id: user.organization_id,
        name: user.organization_name,
    };
}
