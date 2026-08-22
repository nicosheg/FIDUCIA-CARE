// pages/api/people/restore.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

/**
 * Restore a person by setting status = 'active'.
 * Only accessible to authenticated users with the correct organization.
 */
async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Missing person id' });
  }

  const orgId = req.org.id;

  // Verify the person exists and belongs to this organization
  const check = await pool.query(
    `SELECT id FROM people WHERE id = $1 AND organization_id = $2 AND status = 'deleted'`,
    [id, orgId]
  );
  if (check.rows.length === 0) {
    return res.status(404).json({ error: 'Person not found or not deleted' });
  }

  // Restore (set status to active)
  await pool.query(
    `UPDATE people SET status = 'active', updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
    [id, orgId]
  );

  res.status(200).json({ success: true });
}

export default withOrg(handler);
