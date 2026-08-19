// lib/auth.js
import { supabase } from './supabaseClient';
import pool from './db';

/**
 * Get the authenticated user from the request.
 */
export async function getAuthUser(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const token = authHeader.replace('Bearer ', '');
    if (!token) return null;

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return null;
        return user;
    } catch (err) {
        console.error('Auth error:', err);
        return null;
    }
}

/**
 * Get or create a CARE user from a Supabase auth user.
 */
export async function getOrCreateCareUser(authUser, orgId = null) {
    // 1. Find by supabase_user_id
    let result = await pool.query(
        `SELECT * FROM users WHERE supabase_user_id = $1`,
        [authUser.id]
    );
    if (result.rows.length > 0) return result.rows[0];

    // 2. Fallback: by email (for existing users)
    result = await pool.query(
        `SELECT * FROM users WHERE email = $1`,
        [authUser.email]
    );
    if (result.rows.length > 0) {
        await pool.query(
            `UPDATE users SET supabase_user_id = $1 WHERE id = $2`,
            [authUser.id, result.rows[0].id]
        );
        const updated = await pool.query(
            `SELECT * FROM users WHERE id = $1`,
            [result.rows[0].id]
        );
        return updated.rows[0];
    }

    // 3. New user via invitation (orgId must be provided)
    if (orgId) {
        const insert = await pool.query(
            `INSERT INTO users (organization_id, supabase_user_id, email, name, role)
             VALUES ($1, $2, $3, $4, 'user')
             RETURNING *`,
            [orgId, authUser.id, authUser.email, authUser.user_metadata?.name || authUser.email]
        );
        return insert.rows[0];
    }

    return null;
}
