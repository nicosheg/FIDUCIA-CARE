import pool from '../../lib/db';

export default async function handler(req, res) {
  const orgId = req.query.organization_id || req.body?.organization_id || 'demo-org';

  // ---------- GET – list all people ----------
  if (req.method === 'GET') {
    const includeDeleted = req.query.include_deleted === 'true';

    // Base query with computed columns
    const baseQuery = `
      SELECT p.*,
             (SELECT MAX(ar.attendance_date) FROM attendance_records ar
              WHERE ar.member_id = p.id AND ar.present = true) AS last_attended_date,
             (SELECT MAX(te.created_at) FROM timeline_events te
              WHERE te.person_id = p.id
                AND te.event_type IN ('message_sent','call','note','aria_draft')) AS last_contacted
      FROM people p
      WHERE p.organization_id = $1
    `;

    // Append the deleted clause only if we're not including deleted
    const deletedClause = " AND p.status != 'deleted'";
    const finalQuery = includeDeleted
      ? baseQuery + ' ORDER BY p.created_at DESC'
      : baseQuery + deletedClause + ' ORDER BY p.created_at DESC';

    try {
      const { rows } = await pool.query(finalQuery, [orgId]);
      return res.status(200).json(rows);
    } catch (err) {
      console.error('GET people error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ---------- POST – add a new person ----------
  if (req.method === 'POST') {
    const { first_name, last_name, phone, email, type, organization_id } = req.body;
    if (!first_name) return res.status(400).json({ error: 'first_name is required' });

    try {
      const result = await pool.query(
        `INSERT INTO people (organization_id, first_name, last_name, phone, email, type)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [organization_id || orgId, first_name, last_name || '', phone || '', email || '', type || 'visitor']
      );
      return res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error('POST person error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ---------- PUT – update an existing person ----------
  if (req.method === 'PUT') {
    const { id, first_name, last_name, phone, type } = req.body;
    if (!id) return res.status(400).json({ error: 'id is required' });

    try {
      const result = await pool.query(
        `UPDATE people SET first_name=$1, last_name=$2, phone=$3, type=$4, updated_at=now()
         WHERE id=$5 AND organization_id=$6 RETURNING *`,
        [first_name, last_name || '', phone || '', type || 'visitor', id, orgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Person not found' });
      return res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error('PUT person error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
      }
