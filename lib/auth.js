// lib/auth.js
// Canonical authentication + Care-user provisioning.
// Authentication identifies the Supabase user.
// This module then resolves that user to exactly one Care organization.

import crypto from 'crypto';
import { supabase } from './supabaseClient';
import pool from './db';

function getBearerToken(req) {
  const header = req?.headers?.authorization;
  if (typeof header !== 'string') return null;

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function getAuthUser(req) {
  const token = getBearerToken(req);
  if (!token) return null;

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) return null;
    return user;
  } catch (err) {
    console.error('[AUTH] Supabase authentication failed:', err?.message || err);
    return null;
  }
}

export async function getCurrentCareUser(req) {
  const authUser = await getAuthUser(req);
  if (!authUser) return null;

  try {
    const careUser = await ensureCareUser(authUser);
    if (!careUser?.id || !careUser?.organization_id) return null;

    const result = await pool.query(
      `SELECT
         u.*,
         o.id AS organization_id,
         o.name AS organization_name
       FROM users u
       INNER JOIN organizations o
         ON o.id = u.organization_id
       WHERE u.id = $1
         AND u.supabase_user_id = $2
       LIMIT 1`,
      [careUser.id, authUser.id]
    );

    return result.rows[0] || null;
  } catch (err) {
    console.error('[AUTH] Failed to resolve Care user:', err?.message || err);
    return null;
  }
}

export async function ensureCareUser(supabaseUser) {
  if (!supabaseUser?.id) {
    throw new Error('Invalid Supabase user');
  }

  const existing = await pool.query(
    `SELECT id, organization_id
     FROM users
     WHERE supabase_user_id = $1
     LIMIT 1`,
    [supabaseUser.id]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Re-check inside the transaction to reduce provisioning races.
    const locked = await client.query(
      `SELECT id, organization_id
       FROM users
       WHERE supabase_user_id = $1
       FOR UPDATE`,
      [supabaseUser.id]
    );

    if (locked.rows.length > 0) {
      await client.query('COMMIT');
      return locked.rows[0];
    }

    const orgId = `org_${crypto.randomUUID().replace(/-/g, '')}`;

    const metadata = supabaseUser.user_metadata || {};
    const userName =
      metadata.name ||
      metadata.full_name ||
      supabaseUser.email?.split('@')[0] ||
      'Owner';

    const email = supabaseUser.email || null;

    if (!email) {
      throw new Error('Authenticated user has no email address');
    }

    await client.query(
      `INSERT INTO organizations (id, name)
       VALUES ($1, $2)`,
      [orgId, `${userName}'s Organization`]
    );

    const insertResult = await client.query(
      `INSERT INTO users (
         supabase_user_id,
         email,
         name,
         role,
         organization_id
       )
       VALUES ($1, $2, $3, 'owner', $4)
       RETURNING id, organization_id`,
      [supabaseUser.id, email, userName, orgId]
    );

    await client.query('COMMIT');
    return insertResult.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');

    // Another request may have provisioned the user concurrently.
    if (err?.code === '23505') {
      const retry = await pool.query(
        `SELECT id, organization_id
         FROM users
         WHERE supabase_user_id = $1
         LIMIT 1`,
        [supabaseUser.id]
      );

      if (retry.rows.length > 0) {
        return retry.rows[0];
      }
    }

    console.error('[AUTH] User provisioning failed:', err?.message || err);
    throw err;
  } finally {
    client.release();
  }
        }
