// pages/api/people.js
import pool from '../../lib/db';
import { normalizePhone } from '../../lib/phoneUtils';

export default async function handler(req, res) {
  const orgId = req.query.organization_id || req.body?.organization_id || 'demo-org';

  // ---------- GET – list all people ----------
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

  // ---------- POST – add a new person (race-safe) ----------
  if (req.method === 'POST') {
    const { first_name, last_name, phone, email, type, organization_id, birthday } = req.body;
    if (!first_name) return res.status(400).json({ error: 'first_name is required' });

    const normalizedPhone = normalizePhone(phone);

    try {
      const result = await pool.query(
        `INSERT INTO people (organization_id, first_name, last_name, phone, email, type, birthday)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (organization_id, phone) DO NOTHING
         RETURNING id`,
        [organization_id || orgId, first_name, last_name || '', normalizedPhone || null, email || '', type || 'visitor', birthday || null]
      );

      if (result.rows.length > 0) {
        return res.status(200).json({ id: result.rows[0].id, message: 'Person added' });
      } else {
        // Conflict: fetch existing person
        const existing = await pool.query(
          `SELECT id FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
          [organization_id || orgId, normalizedPhone]
        );
        if (existing.rows.length > 0) {
          return res.status(409).json({ error: 'Phone already exists', id: existing.rows[0].id });
        } else {
          return res.status(500).json({ error: 'Unexpected conflict' });
        }
      }
    } catch (err) {
      console.error('POST person error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ---------- PUT – update an existing person (race-safe) ----------
  if (req.method === 'PUT') {
    const { id, first_name, last_name, phone, type, birthday } = req.body;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const normalizedPhone = normalizePhone(phone);

    // Pre-check for friendly early detection (optional but useful)
    if (normalizedPhone) {
      const conflictCheck = await pool.query(
        `SELECT id FROM people WHERE organization_id = $1 AND phone = $2 AND id != $3 LIMIT 1`,
        [orgId, normalizedPhone, id]
      );
      if (conflictCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Phone already belongs to another person' });
      }
    }

    try {
      const result = await pool.query(
        `UPDATE people SET first_name=$1, last_name=$2, phone=$3, type=$4, birthday=$5, updated_at=now()
         WHERE id=$6 AND organization_id=$7 RETURNING *`,
        [first_name, last_name || '', normalizedPhone || null, type || 'visitor', birthday || null, id, orgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Person not found' });
      return res.status(200).json(result.rows[0]);
    } catch (err) {
      // Handle PostgreSQL unique violation (23505) – this is the ultimate authority
      if (err.code === '23505' && err.constraint === 'people_org_phone_unique') {
        return res.status(409).json({ error: 'Phone already belongs to another person' });
      }
      console.error('PUT person error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).end();
      }
