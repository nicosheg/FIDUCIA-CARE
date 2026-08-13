// pages/api/identity/review-items.js
import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const orgId = req.query.organization_id || 'demo-org';

  try {
    // Get the most recent scan job with unresolved review items
    const scanRes = await pool.query(
      `SELECT id, result FROM scan_jobs
       WHERE organization_id = $1 AND status = 'complete'
       ORDER BY created_at DESC
       LIMIT 1`,
      [orgId]
    );
    if (scanRes.rows.length === 0) {
      return res.status(200).json({ items: [], stats: { total: 0, alive: 0, needs_decision: 0, conflict: 0 } });
    }

    const result = scanRes.rows[0].result;
    const needsReview = result.needs_review || [];
    const unresolved = needsReview.filter(item => !item.resolved);

    const stats = {
      total: unresolved.length,
      alive: unresolved.filter(i => i.status === 'alive').length,
      needs_decision: unresolved.filter(i => i.status === 'needs_decision').length,
      conflict: unresolved.filter(i => i.status === 'conflict').length,
    };

    res.status(200).json({ items: unresolved, stats, scan_job_id: scanRes.rows[0].id });
  } catch (err) {
    console.error('Review items error:', err);
    res.status(500).json({ error: err.message });
  }
      }
