// lib/aria/insights.js
import pool from '../db';

export async function generateInsights(orgId) {
  const client = await pool.connect();
  try {
    const insights = [];

    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const prevMonth = new Date(now);
    prevMonth.setMonth(prevMonth.getMonth() - 2);

    const currRes = await client.query(
      `SELECT COUNT(*) AS count
       FROM participation_records
       WHERE organization_id = $1 AND participation_date >= $2 AND present = true`,
      [orgId, lastMonth]
    );
    const prevRes = await client.query(
      `SELECT COUNT(*) AS count
       FROM participation_records
       WHERE organization_id = $1 AND participation_date >= $2 AND participation_date < $3 AND present = true`,
      [orgId, prevMonth, lastMonth]
    );
    const curr = parseInt(currRes.rows[0]?.count || 0);
    const prev = parseInt(prevRes.rows[0]?.count || 0);
    const change = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0;
    if (change !== 0) {
      insights.push(`Participation ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change)}% this month.`);
    }

    const newRes = await client.query(
      `SELECT COUNT(*) AS count
       FROM engagement_metrics
       WHERE organization_id = $1 AND engagement_status = 'first_time' AND first_seen >= NOW() - INTERVAL '4 weeks'`,
      [orgId]
    );
    const newCount = parseInt(newRes.rows[0]?.count || 0);
    if (newCount > 0) {
      insights.push(`${newCount} new people participated this month.`);
    }

    const atRiskRes = await client.query(
      `SELECT COUNT(*) AS count
       FROM engagement_metrics
       WHERE organization_id = $1 AND engagement_status = 'at_risk'`,
      [orgId]
    );
    const atRisk = parseInt(atRiskRes.rows[0]?.count || 0);
    if (atRisk > 0) {
      insights.push(`${atRisk} people are at risk of becoming inactive.`);
    }

    const returnRes = await client.query(
      `SELECT COUNT(*) AS count
       FROM engagement_metrics
       WHERE organization_id = $1 AND engagement_status = 'returning' AND last_seen >= NOW() - INTERVAL '4 weeks'`,
      [orgId]
    );
    const returned = parseInt(returnRes.rows[0]?.count || 0);
    if (returned > 0) {
      insights.push(`${returned} people returned after a long absence.`);
    }

    const urgentRes = await client.query(
      `SELECT COUNT(*) AS count
       FROM engagement_cases
       WHERE organization_id = $1 AND engagement_status = 'urgent_action_required' AND resolved = false`,
      [orgId]
    );
    const urgent = parseInt(urgentRes.rows[0]?.count || 0);
    if (urgent > 0) {
      insights.push(`${urgent} cases require urgent action.`);
    }

    return insights;
  } catch (err) {
    console.error('[Insights] Error:', err);
    throw err;
  } finally {
    client.release();
  }
      }
