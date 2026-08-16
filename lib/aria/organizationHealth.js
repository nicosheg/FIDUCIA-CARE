// lib/aria/organizationHealth.js
import pool from '../db';

export async function computeOrganizationHealth(orgId) {
  const client = await pool.connect();
  try {
    const activeRes = await client.query(
      `SELECT COUNT(*) AS active
       FROM engagement_metrics
       WHERE organization_id = $1 AND last_seen >= NOW() - INTERVAL '4 weeks'`,
      [orgId]
    );
    const totalRes = await client.query(
      `SELECT COUNT(*) AS total
       FROM people WHERE organization_id = $1 AND status = 'active'`,
      [orgId]
    );
    const total = parseInt(totalRes.rows[0]?.total || 0);
    const active = parseInt(activeRes.rows[0]?.active || 0);

    const growthRes = await client.query(
      `SELECT COUNT(*) AS prev_active
       FROM engagement_metrics
       WHERE organization_id = $1 AND last_seen BETWEEN NOW() - INTERVAL '8 weeks' AND NOW() - INTERVAL '4 weeks'`,
      [orgId]
    );
    const prevActive = parseInt(growthRes.rows[0]?.prev_active || 0);
    const growthScore = Math.min(100, Math.round((active / Math.max(1, prevActive)) * 100));

    const retentionRes = await client.query(
      `SELECT COUNT(*) AS retained
       FROM engagement_metrics
       WHERE organization_id = $1 AND last_seen >= NOW() - INTERVAL '4 weeks' AND first_seen < NOW() - INTERVAL '4 weeks'`,
      [orgId]
    );
    const retained = parseInt(retentionRes.rows[0]?.retained || 0);
    const retentionScore = Math.min(100, Math.round((retained / Math.max(1, prevActive)) * 100));

    const careRes = await client.query(
      `SELECT 
         COUNT(*) AS total_cases,
         SUM(CASE WHEN resolved THEN 1 ELSE 0 END) AS resolved_cases
       FROM engagement_cases
       WHERE organization_id = $1`,
      [orgId]
    );
    const totalCases = parseInt(careRes.rows[0]?.total_cases || 0);
    const resolvedCases = parseInt(careRes.rows[0]?.resolved_cases || 0);
    const careScore = totalCases > 0 ? Math.round((resolvedCases / totalCases) * 100) : 100;

    const rateRes = await client.query(
      `SELECT AVG(participation_rate) AS avg_rate
       FROM engagement_metrics
       WHERE organization_id = $1`,
      [orgId]
    );
    const avgRate = parseFloat(rateRes.rows[0]?.avg_rate || 0);
    const engagementScore = Math.min(100, Math.round(avgRate));

    const healthScore = Math.round(
      (active / Math.max(1, total)) * 40 +
      (growthScore * 0.2) +
      (retentionScore * 0.2) +
      (careScore * 0.1) +
      (engagementScore * 0.1)
    );

    await client.query(
      `INSERT INTO organization_health_snapshots
       (organization_id, health_score, retention_score, growth_score, engagement_score, care_score, snapshot_date)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)`,
      [orgId, healthScore, retentionScore, growthScore, engagementScore, careScore]
    );

    return {
      health_score: healthScore,
      retention_score: retentionScore,
      growth_score: growthScore,
      engagement_score: engagementScore,
      care_score: careScore,
    };
  } catch (err) {
    console.error('[OrganizationHealth] Error:', err);
    throw err;
  } finally {
    client.release();
  }
}
