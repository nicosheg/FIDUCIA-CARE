// pages/api/people.js
import pool from '../../lib/db';
import { normalizePhone } from '../../lib/phoneUtils';

export default async function handler(req, res) {
  const orgId = req.query.organization_id || req.body?.organization_id || 'demo-org';

  // ---------- GET ----------
  if (req.method === 'GET') {
    const includeDeleted = req.query.include_deleted === 'true';

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

  // ---------- POST (CREATE) ----------
  if (req.method === 'POST') {
    const { first_name, last_name, phone, email, type, birthday } = req.body;
    if (!first_name) return res.status(400).json({ error: 'first_name is required' });

    const normalizedPhone = normalizePhone(phone);

    try {
      const result = await pool.query(
        `INSERT INTO people (organization_id, first_name, last_name, phone, email, type, birthday)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [orgId, first_name, last_name || '', normalizedPhone || null, email || '', type || 'visitor', birthday || null]
      );
      return res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error('POST person error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ---------- PUT (UPDATE) ----------
  if (req.method === 'PUT') {
    const { id, first_name, last_name, phone, type, birthday } = req.body;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const normalizedPhone = normalizePhone(phone);

    try {
      // Verify organization ownership
      const check = await pool.query(
        `SELECT id FROM people WHERE id = $1 AND organization_id = $2`,
        [id, orgId]
      );
      if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Person not found in this organization' });
      }

      // Build update dynamically – only fields present in request
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (first_name !== undefined) {
        updates.push(`first_name = $${paramCount++}`);
        values.push(first_name);
      }
      if (last_name !== undefined) {
        updates.push(`last_name = $${paramCount++}`);
        values.push(last_name);
      }
      if (phone !== undefined) {
        updates.push(`phone = $${paramCount++}`);
        values.push(normalizedPhone || null);
      }
      if (type !== undefined) {
        updates.push(`type = $${paramCount++}`);
        values.push(type || 'visitor');
      }
      if (birthday !== undefined) {
        updates.push(`birthday = $${paramCount++}`);
        values.push(birthday || null);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);

      values.push(id, orgId);
      const query = `
        UPDATE people
        SET ${updates.join(', ')}
        WHERE id = $${paramCount} AND organization_id = $${paramCount + 1}
        RETURNING *
      `;

      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Person not found' });
      }
      return res.status(200).json(result.rows[0]);
    } catch (err) {
      console.error('PUT person error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
      }
