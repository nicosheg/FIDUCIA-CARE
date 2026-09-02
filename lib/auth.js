// lib/auth.js
// Canonical NYEOCARE authentication + Care-user provisioning.
// Normal signup -> new organization owner.
// Invited member -> organization membership is handled by /api/users/join.
// Invitation tokens are never stored in plaintext.

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
  } catch (error) {
    console.error(
      '[AUTH] Supabase authentication failed:',
      error?.message || error
    );

    return null;
  }
}

export async function getCurrentCareUser(req) {
  const authUser = await getAuthUser(req);

  if (!authUser) return null;

  try {
    const careUser = await ensureCareUser(authUser);

    if (!careUser?.id || !careUser?.organization_id) {
      return null;
    }

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
         AND u.active = true
       LIMIT 1`,
      [
        careUser.id,
        authUser.id,
      ]
    );

    return result.rows[0] || null;
  } catch (error) {
    console.error(
      '[AUTH] Failed to resolve Care user:',
      error?.message || error
    );

    return null;
  }
}

export async function ensureCareUser(supabaseUser) {
  if (!supabaseUser?.id) {
    throw new Error('Invalid Supabase user');
  }

  /*
   * Existing NYEOCARE account.
   */
  const existing = await pool.query(
    `SELECT
       id,
       organization_id
     FROM users
     WHERE supabase_user_id = $1
     LIMIT 1`,
    [supabaseUser.id]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const email = String(
    supabaseUser.email || ''
  ).trim().toLowerCase();

  if (!email) {
    throw new Error(
      'Authenticated user has no email address'
    );
  }

  const metadata = supabaseUser.user_metadata || {};

  const name = String(
    metadata.name ||
    metadata.full_name ||
    email.split('@')[0] ||
    'User'
  ).trim();

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    /*
     * Re-check inside the transaction.
     * Prevents simultaneous requests from
     * creating duplicate NYEOCARE users.
     */
    const locked = await client.query(
      `SELECT
         id,
         organization_id
       FROM users
       WHERE supabase_user_id = $1
       FOR UPDATE`,
      [supabaseUser.id]
    );

    if (locked.rows.length > 0) {
      await client.query('COMMIT');

      return locked.rows[0];
    }

    /*
     * Normal signup path:
     * create a new organization and make
     * this authenticated user its owner.
     */
    const organizationId =
      `org_${crypto.randomUUID().replace(/-/g, '')}`;

    await client.query(
      `INSERT INTO organizations
       (id, name)
       VALUES ($1, $2)`,
      [
        organizationId,
        `${name}'s Space`,
      ]
    );

    const created = await client.query(
      `INSERT INTO users
       (
         supabase_user_id,
         email,
         name,
         role,
         organization_id,
         active
       )
       VALUES ($1, $2, $3, 'owner', $4, true)
       RETURNING
         id,
         organization_id`,
      [
        supabaseUser.id,
        email,
        name,
        organizationId,
      ]
    );

    await client.query('COMMIT');

    return created.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');

    console.error(
      '[AUTH] Care-user provisioning failed:',
      error?.message || error
    );

    throw error;
  } finally {
    client.release();
  }
}
