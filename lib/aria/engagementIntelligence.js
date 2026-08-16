// lib/aria/engagementIntelligence.js
import pool from '../db';

/**
 * Classify engagement status based on participation history.
 */
function classifyEngagement(participationCount, participationRate, lastSeen, firstSeen, now) {
  if (participationCount === 0) {
    return 'first_time';
  }
  const daysSinceLast = Math.floor((now - new Date(lastSeen)) / (1000 * 60 * 60 * 24));
  const weeksSinceLast = Math.floor(daysSinceLast / 7);
  if (weeksSinceLast < 4 && participationCount >= 4) {
    return 'regular';
  }
  if (weeksSinceLast < 4) {
    return participationCount === 1 ? 'first_time' : 'returning';
  }
  if (weeksSinceLast < 8) {
    return 'at_risk';
  }
  if (weeksSinceLast >= 8) {
    const weeksSinceFirst = Math.floor((now - new Date(firstSeen)) / (1000 * 60 * 60 * 24 * 7));
    if (weeksSinceFirst > 8) {
      return 'inactive';
    } else {
      return 'inactive';
    }
  }
  return 'inactive';
}

export async function updateEngagementMetrics(orgId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const peopleRes = await client.query(
      `SELECT id FROM people WHERE organization_id = $1 AND status = 'active'`,
      [orgId]
    );

    const now = new Date();
    for (const person of peopleRes.rows) {
      const partRes = await client.query(
        `SELECT participation_date
         FROM participation_records
         WHERE person_id = $1 AND present = true AND organization_id = $2
         ORDER BY participation_date`,
        [person.id, orgId]
      );
      const dates = partRes.rows.map(r => new Date(r.participation_date));
      const total = dates.length;
      if (total === 0) {
        await client.query(
          `INSERT INTO engagement_metrics
           (person_id, organization_id, participation_count, participation_rate, first_seen, last_seen, engagement_status, updated_at)
           VALUES ($1, $2, 0, 0, NULL, NULL, 'first_time', NOW())
           ON CONFLICT (person_id) DO UPDATE SET
             participation_count = 0,
             participation_rate = 0,
             engagement_status = 'first_time',
             first_seen = NULL,
             last_seen = NULL,
             updated_at = NOW()`,
          [person.id, orgId]
        );
        continue;
      }

      const firstSeen = dates[0];
      const lastSeen = dates[dates.length - 1];
      const daysSinceFirst = Math.floor((now - firstSeen) / (1000 * 60 * 60 * 24));
      const weeksSinceFirst = Math.max(1, Math.floor(daysSinceFirst / 7));
      const participationRate = Math.min(100, Math.round((total / weeksSinceFirst) * 100));
      
      let inactivityStreak = 0;
      let participationStreak = 0;
      if (dates.length > 0) {
        const lastDate = dates[dates.length - 1];
        const daysSinceLast = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
        inactivityStreak = Math.floor(daysSinceLast / 7);
        if (inactivityStreak === 0) {
          participationStreak = 1;
        } else {
          participationStreak = 0;
        }
      }

      const status = classifyEngagement(total, participationRate, lastSeen, firstSeen, now);

      await client.query(
        `INSERT INTO engagement_metrics
         (person_id, organization_id, participation_count, participation_rate, participation_streak, inactivity_streak, first_seen, last_seen, engagement_status, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (person_id) DO UPDATE SET
           participation_count = EXCLUDED.participation_count,
           participation_rate = EXCLUDED.participation_rate,
           participation_streak = EXCLUDED.participation_streak,
           inactivity_streak = EXCLUDED.inactivity_streak,
           first_seen = EXCLUDED.first_seen,
           last_seen = EXCLUDED.last_seen,
           engagement_status = EXCLUDED.engagement_status,
           updated_at = NOW()`,
        [
          person.id,
          orgId,
          total,
          participationRate,
          participationStreak,
          inactivityStreak,
          firstSeen.toISOString().split('T')[0],
          lastSeen.toISOString().split('T')[0],
          status
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`[Engagement] Updated metrics for ${peopleRes.rows.length} people`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Engagement] Engine error:', err);
    throw err;
  } finally {
    client.release();
  }
}
