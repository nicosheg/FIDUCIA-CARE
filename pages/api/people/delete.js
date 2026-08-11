// pages/api/people/delete.js
import pool from '../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, ids } = req.body;
  const orgId = req.query.organization_id || req.body?.organization_id || 'demo-org';

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

    const existingRes = await client.query(
      `SELECT id FROM people WHERE organization_id = $1 AND id = ANY($2)`,
      [orgId, deleteIds]
    );
    const existingIds = existingRes.rows.map(row => row.id);
    const notFoundIds = deleteIds.filter(id => !existingIds.includes(id));

    if (existingIds.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'No matching people found',
        requested: deleteIds.length,
        deleted: 0,
        deleted_ids: [],
        not_found_ids: deleteIds,
      });
    }

    // Delete dependent records using people_id
    await client.query(`DELETE FROM attendance_records WHERE people_id = ANY($1)`, [existingIds]);
    await client.query(`DELETE FROM timeline_events WHERE people_id = ANY($1)`, [existingIds]);
    // Optional tables (if exist, they will be skipped if not)
    await deleteFromTableIfExists(client, 'follow_up_logs', 'people_id', existingIds);
    await deleteFromTableIfExists(client, 'usher_marks', 'people_id', existingIds);
    await deleteFromTableIfExists(client, 'care_queue', 'people_id', existingIds);
    await deleteFromTableIfExists(client, 'group_memberships', 'people_id', existingIds);

    const deleteResult = await client.query(
      `DELETE FROM people WHERE organization_id = $1 AND id = ANY($2) RETURNING id`,
      [orgId, existingIds]
    );
    const deletedIds = deleteResult.rows.map(row => row.id);

    if (deletedIds.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Deletion failed – no records removed',
        requested: deleteIds.length,
        deleted: 0,
        deleted_ids: [],
        not_found_ids: deleteIds,
      });
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      requested: deleteIds.length,
      deleted: deletedIds.length,
      deleted_ids: deletedIds,
      not_found_ids: notFoundIds,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal server error',
      requested: deleteIds.length,
      deleted: 0,
      deleted_ids: [],
      not_found_ids: deleteIds,
    });
  } finally {
    client.release();
  }
}

async function deleteFromTableIfExists(client, tableName, columnName, ids) {
  const check = await client.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)`,
    [tableName]
  );
  if (check.rows[0].exists) {
    await client.query(`DELETE FROM ${tableName} WHERE ${columnName} = ANY($1)`, [ids]);
  }
}
