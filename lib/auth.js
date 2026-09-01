// lib/auth.js
// Canonical authentication + Care-user provisioning.
//
// A normal new account becomes the owner of a new organization.
//
// An invited account joins the existing organization represented
// by its invitation token.
//
// Invitation tokens are never stored in plaintext.

import crypto from 'crypto';
import { supabase } from './supabaseClient';
import pool from './db';

function getBearerToken(req) {
  const header = req?.headers?.authorization;

  if (typeof header !== 'string') {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : null;
}

function hashInvitationToken(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

export async function getAuthUser(req) {
  const token = getBearerToken(req);

  if (!token) return null;

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return user;
  } catch (err) {
    console.error(
      '[AUTH] Supabase authentication failed:',
      err?.message || err
    );

    return null;
  }
}

export async function getCurrentCareUser(req) {
  const authUser = await getAuthUser(req);

  if (!authUser) {
    return null;
  }

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
  } catch (err) {
    console.error(
      '[AUTH] Failed to resolve Care user:',
      err?.message || err
    );

    return null;
  }
}

export async function ensureCareUser(supabaseUser) {
  if (!supabaseUser?.id) {
    throw new Error('Invalid Supabase user');
  }

  /*
   * ------------------------------------------------------------
   * Existing Care account
   * ------------------------------------------------------------
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

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    /*
     * Re-check inside transaction to prevent
     * simultaneous provisioning races.
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

    const metadata = supabaseUser.user_metadata || {};

    const userName =
      metadata.name ||
      metadata.full_name ||
      supabaseUser.email?.split('@')[0] ||
      'User';

    const email = supabaseUser.email || null;

    if (!email) {
      throw new Error(
        'Authenticated user has no email address'
      );
    }

    /*
     * ------------------------------------------------------------
     * INVITATION PATH
     * ------------------------------------------------------------
     */
    const invitationToken =
      typeof metadata.invitation_token === 'string'
        ? metadata.invitation_token.trim()
        : '';

    if (invitationToken) {
      const tokenHash =
        hashInvitationToken(invitationToken);

      const invitationResult = await client.query(
        `SELECT
           id,
           organization_id,
           name,
           role,
           expires_at
         FROM invitations
         WHERE token_hash = $1
           AND accepted_at IS NULL
           AND revoked_at IS NULL
         FOR UPDATE`,
        [tokenHash]
      );

      if (invitationResult.rows.length === 0) {
        throw new Error(
          'INVITATION_INVALID'
        );
      }

      const invitation =
        invitationResult.rows[0];

      if (
        invitation.expires_at &&
        new Date(invitation.expires_at) <= new Date()
      ) {
        throw new Error(
          'INVITATION_EXPIRED'
        );
      }

      /*
       * Invitation names are a starting point.
       *
       * The actual account remains owned by the person
       * who creates/logs into it.
       */
      const finalName =
        userName ||
        invitation.name ||
        'User';

      /*
       * Make sure this Supabase account has not
       * already been attached to this organization
       * through another race.
       */
      const existingEmail = await client.query(
        `SELECT
           id,
           organization_id,
           supabase_user_id
         FROM users
         WHERE organization_id = $1
           AND lower(email) = lower($2)
         LIMIT 1`,
        [
          invitation.organization_id,
          email,
        ]
      );

      if (existingEmail.rows.length > 0) {
        const existingMember =
          existingEmail.rows[0];

        /*
         * If an existing organization member already
         * owns this email, connect the authenticated
         * Supabase account to that existing member.
         */
        if (
          !existingMember.supabase_user_id
        ) {
          const updated =
            await client.query(
              `UPDATE users
               SET
                 supabase_user_id = $1,
                 name = $2,
                 active = true,
                 updated_at = now()
               WHERE id = $3
               RETURNING id, organization_id`,
              [
                supabaseUser.id,
                finalName,
                existingMember.id,
              ]
            );

          await client.query(
            `UPDATE invitations
             SET
               accepted_at = now(),
               accepted_by = $1
             WHERE id = $2`,
            [
              updated.rows[0].id,
              invitation.id,
            ]
          );

          await client.query('COMMIT');

          return updated.rows[0];
        }

        /*
         * Email is already tied to another
         * Supabase account.
         */
        throw new Error(
          'ACCOUNT_ALREADY_EXISTS'
        );
      }

      /*
       * Create the invited organization member.
       */
      const invitedUser =
        await client.query(
          `INSERT INTO users (
             supabase_user_id,
             email,
             name,
             role,
             organization_id,
             active
           )
           VALUES (
             $1,
             $2,
             $3,
             $4,
             $5,
             true
           )
           RETURNING
             id,
             organization_id`,
          [
            supabaseUser.id,
            email,
            finalName,
            invitation.role,
            invitation.organization_id,
          ]
        );

      /*
       * Consume the invitation atomically.
       */
      await client.query(
        `UPDATE invitations
         SET
           accepted_at = now(),
           accepted_by = $1
         WHERE id = $2`,
        [
          invitedUser.rows[0].id,
          invitation.id,
        ]
      );

      await client.query('COMMIT');

      return invitedUser.rows[0];
    }

    /*
     * ------------------------------------------------------------
     * NORMAL NEW ACCOUNT
     * ------------------------------------------------------------
     *
     * No invitation means this is a fresh organization.
     */
    const orgId =
      `org_${crypto.randomUUID().replace(/-/g, '')}`;

    await client.query(
      `INSERT INTO organizations (
         id,
         name
       )
       VALUES ($1, $2)`,
      [
        orgId,
        `${userName}'s Organization`,
      ]
    );

    const insertResult =
      await client.query(
        `INSERT INTO users (
           supabase_user_id,
           email,
           name,
           role,
           organization_id
         )
         VALUES (
           $1,
           $2,
           $3,
           'owner',
           $4
         )
         RETURNING
           id,
           organization_id`,
        [
          supabaseUser.id,
          email,
          userName,
          orgId,
        ]
      );

    await client.query('COMMIT');

    return insertResult.rows[0];
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Ignore rollback failure.
    }

    /*
     * Another request may have provisioned the
     * same Supabase account concurrently.
     */
    if (err?.code === '23505') {
      const retry = await pool.query(
        `SELECT
           id,
           organization_id
         FROM users
         WHERE supabase_user_id = $1
         LIMIT 1`,
        [supabaseUser.id]
      );

      if (retry.rows.length > 0) {
        return retry.rows[0];
      }
    }

    console.error(
      '[AUTH] User provisioning failed:',
      err?.message || err
    );

    throw err;
  } finally {
    client.release();
  }
      }
