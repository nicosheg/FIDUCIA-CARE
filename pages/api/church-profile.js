// pages/api/church-profile.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

/**
 * Manage church profile settings.
 * GET  → retrieve settings for the user's organization.
 * POST → save/update settings for the user's organization.
 */
async function handler(req, res) {
  const orgId = req.org.id;

  // GET: retrieve profile
  if (req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT value FROM settings WHERE key = 'church_profile' AND organization_id = $1`,
        [orgId]
      );
      if (result.rows.length === 0) {
        return res.status(200).json({ services: [], programs: [], timezone: '' });
      }
      return res.status(200).json(result.rows[0].value);
    } catch (err) {
      console.error('Church profile GET error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // POST: save/update profile
  if (req.method === 'POST') {
    const { services, programs, timezone } = req.body;
    const value = { services: services || [], programs: programs || [], timezone: timezone || '' };

    try {
      // Upsert: insert if not exists, otherwise update
      await pool.query(
        `INSERT INTO settings (organization_id, key, value)
         VALUES ($1, 'church_profile', $2)
         ON CONFLICT (organization_id, key)
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [orgId, JSON.stringify(value)]
      );
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Church profile POST error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
}

export default withOrg(handler);
