import pool from '../../lib/db';

export default async function handler(req, res) {
  const orgId = req.query.organization_id || req.body?.organization_id || 'demo-org';

  if (req.method === 'GET') {
    const includeDeleted = req.query.include_deleted === 'true';
    let query = `SELECT * FROM people WHERE organization_id = $1`;
    if (!includeDeleted) query += ` AND status != 'deleted'`;
    query += ` ORDER BY created_at DESC`;
    const { rows } = await pool.query(query, [orgId]);
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const { first_name, last_name, phone, email, type, organization_id } = req.body;
    const result = await pool.query(
      `INSERT INTO people (organization_id, first_name, last_name, phone, email, type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [organization_id || orgId, first_name, last_name || '', phone || '', email || '', type || 'visitor']
    );
    return res.status(200).json(result.rows[0]);
  }

  if (req.method === 'PUT') {
    const { id, first_name, last_name, phone, type } = req.body;
    const result = await pool.query(
      `UPDATE people SET first_name=$1, last_name=$2, phone=$3, type=$4, updated_at=now() WHERE id=$5 AND organization_id=$6 RETURNING *`,
      [first_name, last_name || '', phone || '', type || 'visitor', id, orgId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Person not found' });
    return res.status(200).json(result.rows[0]);
  }

  res.status(405).end();
      }
