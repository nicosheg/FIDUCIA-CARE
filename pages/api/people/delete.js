// pages/api/people/delete.js
import pool from '../../../lib/db';

/**
 * Helper to delete from a table only if it exists.
 * Hard-coded table/column names – safe against SQL injection.
 */
async function deleteFromTableIfExists(client, tableName, columnName, ids) {
  // Check if table exists in public schema
  const check = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     )`,
    [tableName]
  );
  if (!check.rows[0].exists) {
    console.warn(`DELETE: Table "${tableName}" does not exist – skipping.`);
    return;
  }
  // Table exists → delete
  await client.query(
    `DELETE FROM ${tableName} WHERE ${columnName} = ANY($1)`,
    [ids]
  );
}

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

    // 1. Verify existing IDs in this organization
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

    // 2. Delete from dependent tables – only if they exist
    await deleteFromTableIfExists(client, 'attendance_records', 'member_id', existingIds);
    await deleteFromTableIfExists(client, 'timeline_events', 'person_id', existingIds);
    await deleteFromTableIfExists(client, 'group_memberships', 'person_id', existingIds);
    await deleteFromTableIfExists(client, 'care_queue', 'person_id', existingIds);
    await deleteFromTableIfExists(client, 'usher_activity', 'person_id', existingIds);

    // 3. Delete people (this table definitely exists)
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
