// lib/aria/engagementCases.js
import pool from '../db';

function getStatusAndRisk(inactivityStreak) {
  if (inactivityStreak === 0) {
    return { status: 'active', risk: 'low' };
  } else if (inactivityStreak === 1) {
    return { status: 'needs_attention', risk: 'medium' };
  } else if (inactivityStreak === 2) {
    return { status: 'at_risk', risk: 'high' };
  } else { // 3+
    return { status: 'urgent_action_required', risk: 'critical' };
  }
}

export async function updateEngagementCases(orgId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const peopleRes = await client.query(
      `SELECT id FROM people WHERE organization_id = $1 AND status = 'active'`,
      [orgId]
    );

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const person of peopleRes.rows) {
      const partRes = await client.query(
        `SELECT MAX(participation_date) as last_seen
         FROM participation_records
         WHERE person_id = $1 AND present = true AND organization_id = $2`,
        [person.id, orgId]
      );
      const lastSeen = partRes.rows[0]?.last_seen;

      let inactivityStreak = 0;
      let lastSeenDate = lastSeen;

      if (lastSeen) {
        const daysSince = Math.floor((today - new Date(lastSeen)) / (1000 * 60 * 60 * 24));
        inactivityStreak = Math.floor(daysSince / 7);
        if (daysSince < 7) inactivityStreak = 0;
      } else {
        inactivityStreak = 0;
      }

      const { status, risk } = getStatusAndRisk(inactivityStreak);

      await client.query(
        `INSERT INTO engagement_cases
         (person_id, organization_id, risk_level, engagement_status, inactivity_streak, last_seen, resolved, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (person_id, organization_id)
         DO UPDATE SET
           risk_level = EXCLUDED.risk_level,
           engagement_status = EXCLUDED.engagement_status,
           inactivity_streak = EXCLUDED.inactivity_streak,
           last_seen = EXCLUDED.last_seen,
           resolved = EXCLUDED.resolved,
           updated_at = NOW()
         WHERE engagement_cases.organization_id = $2`,
        [
          person.id,
          orgId,
          risk,
          status,
          inactivityStreak,
          lastSeenDate,
          inactivityStreak === 0
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`[EngagementCases] Updated for ${peopleRes.rows.length} people`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[EngagementCases] Error:', err);
    throw err;
  } finally {
    client.release();
  }
    }
