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

// NEW: Idempotent, transaction-safe provisioning
export async function ensureCareUser(supabaseUser) {
    // Fast path: already provisioned
    const existing = await pool.query(
        `SELECT id, organization_id FROM users WHERE supabase_user_id = $1`,
        [supabaseUser.id]
    );
    if (existing.rows.length > 0) {
        return existing.rows[0];
    }

    // Provisioning path with atomic transaction
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const orgId = 'org_' + crypto.randomUUID().replace(/-/g, '');
        const userName = supabaseUser.user_metadata?.name ||
                         supabaseUser.user_metadata?.full_name ||
                         supabaseUser.email.split('@')[0];

        // Create organization
        await client.query(
            `INSERT INTO organizations (id, name) VALUES ($1, $2)`,
            [orgId, `${userName}'s Organization`]
        );

        // Create user profile (password_hash is legacy NOT NULL, we use sentinel)
        await client.query(
            `INSERT INTO users (supabase_user_id, email, name, role, organization_id, password_hash)
             VALUES ($1, $2, $3, 'owner', $4, 'supabase_managed')`,
            [supabaseUser.id, supabaseUser.email, userName, orgId]
        );

        await client.query('COMMIT');
        return { id: null, organization_id: orgId };
    } catch (err) {
        await client.query('ROLLBACK');

        // Unique constraint: another request already created it
        if (err.code === '23505') {
            const retry = await pool.query(
                `SELECT id, organization_id FROM users WHERE supabase_user_id = $1`,
                [supabaseUser.id]
            );
            if (retry.rows.length > 0) return retry.rows[0];
        }
        throw err;
    } finally {
        client.release();
    }
    }
