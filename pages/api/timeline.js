import pool from '../../lib/db';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { person_id, event_type, channel, description, metadata, organization_id } = req.body;
    if (!person_id || !event_type) return res.status(400).json({ error: 'Missing person_id or event_type' });
    try {
      const result = await pool.query(
        `INSERT INTO timeline_events (person_id, organization_id, event_type, channel, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [person_id, organization_id || 'demo-org', event_type, channel || null, description || '', metadata || {}]
      );
      return res.status(200).json(result.rows[0]);
    } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
  }

  if (req.method === 'GET') {
    const personId = req.query.person_id;
    const orgId = req.query.organization_id || 'demo-org';
    try {
      const { rows } = await pool.query(
        `SELECT * FROM timeline_events WHERE person_id = $1 AND organization_id = $2 ORDER BY created_at DESC`,
        [personId, orgId]
      );
      return res.status(200).json(rows);
    } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
  }

  res.status(405).end();
  }
