// lib/aria/dailyBriefing.js
import pool from '../db';
import { updateEngagementMetrics } from './engagementIntelligence';
import { updateEngagementCases } from './engagementCases';

export async function generateDailyBriefing(orgId) {
  await updateEngagementMetrics(orgId);
  await updateEngagementCases(orgId);

  const client = await pool.connect();
  try {
    const metricsRes = await client.query(
      `SELECT 
         COUNT(*) AS total_participants,
         SUM(CASE WHEN engagement_status IN ('regular','returning','new_member','returning','highly_engaged') THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN engagement_status = 'first_time' THEN 1 ELSE 0 END) AS new_people,
         SUM(CASE WHEN engagement_status = 'returning' THEN 1 ELSE 0 END) AS returning_people,
         SUM(CASE WHEN engagement_status = 'at_risk' THEN 1 ELSE 0 END) AS at_risk,
         SUM(CASE WHEN engagement_status = 'inactive' THEN 1 ELSE 0 END) AS inactive
       FROM engagement_metrics
       WHERE organization_id = $1`,
      [orgId]
    );
    const metrics = metricsRes.rows[0] || {};

    const caseRes = await client.query(
      `SELECT engagement_status, COUNT(*) AS count
       FROM engagement_cases
       WHERE organization_id = $1 AND resolved = false
       GROUP BY engagement_status`,
      [orgId]
    );
    const caseMap = {};
    caseRes.rows.forEach(row => {
      caseMap[row.engagement_status] = parseInt(row.count, 10);
    });

    const recommendations = [];

    const urgentRes = await client.query(
      `SELECT p.id, p.first_name, ec.inactivity_streak
       FROM engagement_cases ec
       JOIN people p ON ec.person_id = p.id
       WHERE ec.organization_id = $1 AND ec.engagement_status IN ('at_risk', 'urgent_action_required') AND ec.resolved = false
       ORDER BY ec.inactivity_streak DESC LIMIT 5`,
      [orgId]
    );
    urgentRes.rows.forEach(row => {
      recommendations.push(`Check on ${row.first_name} (inactive for ${row.inactivity_streak} weeks)`);
    });

    const newRes = await client.query(
      `SELECT p.id, p.first_name
       FROM engagement_metrics em
       JOIN people p ON em.person_id = p.id
       WHERE em.organization_id = $1 AND em.engagement_status = 'first_time' AND em.last_seen IS NOT NULL
       ORDER BY em.last_seen DESC LIMIT 3`,
      [orgId]
    );
    newRes.rows.forEach(row => {
      recommendations.push(`Welcome ${row.first_name} (new person)`);
    });

    const returnRes = await client.query(
      `SELECT p.id, p.first_name
       FROM engagement_metrics em
       JOIN people p ON em.person_id = p.id
       WHERE em.organization_id = $1 AND em.engagement_status = 'returning' AND em.last_seen IS NOT NULL
       ORDER BY em.last_seen DESC LIMIT 3`,
      [orgId]
    );
    returnRes.rows.forEach(row => {
      recommendations.push(`Welcome back ${row.first_name}`);
    });

    const summary = `Good morning.
Total participants: ${metrics.total_participants || 0}.
New people: ${metrics.new_people || 0}.
Returning people: ${metrics.returning_people || 0}.
At-risk people: ${metrics.at_risk || 0}.
Inactive people: ${metrics.inactive || 0}.
Recommended actions: ${recommendations.length}.`;

    const briefRes = await client.query(
      `INSERT INTO daily_briefings (organization_id, summary, metrics, recommendations, generated_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [orgId, summary, JSON.stringify(metrics), JSON.stringify(recommendations)]
    );

    await client.query('COMMIT');
    return {
      id: briefRes.rows[0].id,
      summary,
      metrics,
      recommendations,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[DailyBriefing] Error:', err);
    throw err;
  } finally {
    client.release();
  }
      }
