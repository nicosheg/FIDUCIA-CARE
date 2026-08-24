// lib/aria/engagementIntelligence.js
import pool from '../db';
import { getOrgSettings } from './organizationSettings';
import { classifyEngagement } from './engagementClassifier';

/**
 * Calculate engagement metrics for one person.
 * participation_records is the authoritative engagement source.
 */
export async function updateEngagementMetricsForPerson(personId, orgId) {
  if (!personId || !orgId) {
    throw new Error('personId and orgId are required');
  }

  const client = await pool.connect();

  try {
    const [partRes, settings] = await Promise.all([
      client.query(
        `
        SELECT participation_date
        FROM participation_records
        WHERE person_id = $1
          AND organization_id = $2
          AND present = true
        ORDER BY participation_date ASC
        `,
        [personId, orgId]
      ),
      getOrgSettings(orgId),
    ]);

    const dates = partRes.rows.map(row => new Date(row.participation_date));
    const total = dates.length;
    const now = new Date();

    let firstSeen = null;
    let lastSeen = null;
    let participationRate = 0;
    let inactivityStreak = 0;
    let participationStreak = 0;
    let weeksSinceLast = 0;

    if (total > 0) {
      firstSeen = dates[0];
      lastSeen = dates[dates.length - 1];

      const daysSinceFirst = Math.max(
        0,
        Math.floor((now.getTime() - firstSeen.getTime()) / (1000 * 60 * 60 * 24))
      );
      const daysSinceLast = Math.max(
        0,
        Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24))
      );

      weeksSinceLast = Math.floor(daysSinceLast / 7);
      inactivityStreak = weeksSinceLast;

      // Legacy frequency metric – not based on program_type yet.
      const cycleDays = Math.max(1, Number(settings.engagement_cycle_days) || 7);
      const elapsedCycles = Math.max(1, Math.ceil(daysSinceFirst / cycleDays));
      participationRate = Math.min(100, Math.round((total / elapsedCycles) * 100));
      participationStreak = inactivityStreak === 0 ? 1 : 0;
    }

    const classification = classifyEngagement({
      totalParticipation: total,
      weeksSinceLast,
      inactivityStreak,
      settings,
    });

    await client.query(
      `
      INSERT INTO engagement_metrics (
        person_id,
        organization_id,
        participation_count,
        participation_rate,
        participation_streak,
        inactivity_streak,
        first_seen,
        last_seen,
        engagement_status,
        risk_level,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, NOW()
      )
      ON CONFLICT (person_id)
      DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        participation_count = EXCLUDED.participation_count,
        participation_rate = EXCLUDED.participation_rate,
        participation_streak = EXCLUDED.participation_streak,
        inactivity_streak = EXCLUDED.inactivity_streak,
        first_seen = EXCLUDED.first_seen,
        last_seen = EXCLUDED.last_seen,
        engagement_status = EXCLUDED.engagement_status,
        risk_level = EXCLUDED.risk_level,
        updated_at = NOW()
      `,
      [
        personId,
        orgId,
        total,
        participationRate,
        participationStreak,
        inactivityStreak,
        firstSeen,
        lastSeen,
        classification.engagementState,
        classification.riskLevel,
      ]
    );

    return {
      personId,
      organizationId: orgId,
      participationCount: total,
      participationRate,
      inactivityStreak,
      engagementStatus: classification.engagementState,
      careState: classification.careState,
      riskLevel: classification.riskLevel,
      firstSeen,
      lastSeen,
    };
  } finally {
    client.release();
  }
}

/**
 * Recalculate engagement metrics for all active people in an organization.
 * Uses keyset pagination (id > last_id) for stable performance at scale.
 */
export async function updateEngagementMetrics(orgId, options = {}) {
  if (!orgId) throw new Error('orgId is required');

  const chunkSize = Math.max(1, Math.min(Number(options.chunkSize) || 500, 2000));
  let lastId = null;
  let totalProcessed = 0;

  while (true) {
    const people = await pool.query(
      `
      SELECT id
      FROM people
      WHERE organization_id = $1
        AND status = 'active'
        AND ($2::uuid IS NULL OR id > $2::uuid)
      ORDER BY id
      LIMIT $3
      `,
      [orgId, lastId, chunkSize]
    );

    if (people.rows.length === 0) break;

    for (const person of people.rows) {
      await updateEngagementMetricsForPerson(person.id, orgId);
      totalProcessed++;
    }

    lastId = people.rows[people.rows.length - 1].id;
  }

  console.log(`[EngagementMetrics] Updated ${totalProcessed} people for org ${orgId}`);
  return totalProcessed;
  }
