// pages/api/aria/observations.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';
import { getAggregatedObservations } from '../../../lib/aria/observationEngine';

async function handler(req, res) {
  const orgId = req.org.id;
  const { aggregated = 'true', limit = 10 } = req.query;

  if (aggregated === 'true') {
    try {
      const summaries = await getAggregatedObservations(orgId);
      // Also fetch top individual observations
      const topObs = await pool.query(
        `SELECT o.*, p.first_name, p.phone
         FROM aria_observations o
         LEFT JOIN people p ON o.person_id = p.id
         WHERE o.organization_id = $1 AND o.status = 'active'
         ORDER BY o.attention_score DESC
         LIMIT $2`,
        [orgId, parseInt(limit, 10)]
      );
      res.status(200).json({
        summaries,
        top: topObs.rows,
      });
    } catch (err) {
      console.error('Error fetching ARIA observations:', err);
      res.status(500).json({ error: err.message });
    }
  } else {
    // Non‑aggregated (raw) – fallback
    const result = await pool.query(
      `SELECT o.*, p.first_name, p.phone
       FROM aria_observations o
       LEFT JOIN people p ON o.person_id = p.id
       WHERE o.organization_id = $1 AND o.status = 'active'
       ORDER BY o.attention_score DESC
       LIMIT $2`,
      [orgId, parseInt(limit, 10)]
    );
    res.status(200).json(result.rows);
  }
}

export default withOrg(handler);
