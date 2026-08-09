import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, ids } = req.body;

  // Support both single delete (id) and bulk delete (ids array)
  let deleteIds = [];
  if (ids && Array.isArray(ids) && ids.length > 0) {
    deleteIds = ids;
  } else if (id) {
    deleteIds = [id];
  } else {
    return res.status(400).json({ error: 'Missing id or ids' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Delete attendance records (cascade manually if FK not set)
    await client.query(
      `DELETE FROM attendance_records WHERE member_id = ANY($1)`,
      [deleteIds]
    );

    // 2. Delete timeline events
    await client.query(
      `DELETE FROM timeline_events WHERE person_id = ANY($1)`,
      [deleteIds]
    );

    // 3. Delete group memberships
    await client.query(
      `DELETE FROM group_memberships WHERE person_id = ANY($1)`,
      [deleteIds]
    );

    // 4. Delete care queue items
    await client.query(
      `DELETE FROM care_queue WHERE person_id = ANY($1)`,
      [deleteIds]
    );

    // 5. Finally, delete the people
    const result = await client.query(
      `DELETE FROM people WHERE id = ANY($1) RETURNING id`,
      [deleteIds]
    );

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      deleted: result.rows.length,
      ids: result.rows.map(r => r.id),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
      }
