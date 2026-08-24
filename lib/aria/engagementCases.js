// lib/aria/engagementCases.js
import pool from '../db';
import { getOrgSettings } from './organizationSettings';
import { classifyEngagement } from './engagementClassifier';

export async function updateEngagementCases(orgId) {
  if (!orgId) throw new Error('orgId is required');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const settings = await getOrgSettings(orgId);
    const peopleRes = await client.query(
      `
      SELECT id
      FROM people
      WHERE organization_id = $1
        AND status = 'active'
      ORDER BY id
      `,
      [orgId]
    );

    for (const person of peopleRes.rows) {
      const metricsRes = await client.query(
        `
        SELECT
          participation_count,
          inactivity_streak,
          last_seen,
          engagement_status
        FROM engagement_metrics
        WHERE person_id = $1
          AND organization_id = $2
        LIMIT 1
        `,
        [person.id, orgId]
      );

      // No metrics → no care case yet.
      if (metricsRes.rows.length === 0) continue;

      const metrics = metricsRes.rows[0];
      const inactivityStreak = Number(metrics.inactivity_streak) || 0;
      const totalParticipation = Number(metrics.participation_count) || 0;

      const classification = classifyEngagement({
        totalParticipation,
        weeksSinceLast: inactivityStreak,
        inactivityStreak,
        settings,
      });

      await client.query(
        `
        INSERT INTO engagement_cases (
          person_id,
          organization_id,
          risk_level,
          engagement_status,
          inactivity_streak,
          last_seen,
          resolved,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, NOW()
        )
        ON CONFLICT (person_id, organization_id)
        DO UPDATE SET
          risk_level = EXCLUDED.risk_level,
          engagement_status = EXCLUDED.engagement_status,
          inactivity_streak = EXCLUDED.inactivity_streak,
          last_seen = EXCLUDED.last_seen,
          resolved = EXCLUDED.resolved,
          updated_at = NOW()
        `,
        [
          person.id,
          orgId,
          classification.riskLevel,
          classification.careState,
          inactivityStreak,
          metrics.last_seen,
          classification.careState === 'active',
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`[EngagementCases] Updated ${peopleRes.rows.length} people for org ${orgId}`);
    return peopleRes.rows.length;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[EngagementCases] Rollback failed:', rollbackErr);
    }
    console.error('[EngagementCases] Error:', err);
    throw err;
  } finally {
    client.release();
  }
        }
