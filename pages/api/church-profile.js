// pages/api/church-profile.js
import pool from '../../lib/db';
import { withOrg } from '../../lib/apiHelpers';

async function handler(req, res) {
  const orgId = req.org.id;

  if (req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT services, programs FROM church_profile WHERE organization_id = $1`,
        [orgId]
      );
      if (result.rows.length === 0) {
        return res.status(200).json({ services: [], programs: [] });
      }
      return res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error('Church profile GET error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { services, programs } = req.body;
    try {
      await pool.query(
        `INSERT INTO church_profile (organization_id, services, programs)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id) DO UPDATE SET
           services = EXCLUDED.services,
           programs = EXCLUDED.programs,
           updated_at = NOW()`,
        [orgId, services || [], programs || []]
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
