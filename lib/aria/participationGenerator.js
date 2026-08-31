// FILE: lib/aria/participationGenerator.js
// Converts confirmed PRESENT attendance into canonical participation records.
// Safe to run repeatedly for the same session.

import pool from '../db';
import { updateEngagementMetricsForPerson } from './engagementIntelligence';

export async function generateParticipationFromSession(sessionId, orgId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Verify the session belongs to the organization.
    const session = await client.query(
      `SELECT id
       FROM sessions
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [sessionId, orgId]
    );

    if (!session.rows.length) {
      await client.query('ROLLBACK');
      throw new Error('Session does not belong to organization.');
    }

    const attendanceRes = await client.query(
      `SELECT ar.people_id,ar.attendance_date
       FROM attendance_records ar
       JOIN people p
         ON p.id = ar.people_id
        AND p.organization_id = ar.organization_id
       WHERE ar.session_id = $1
         AND ar.organization_id = $2
         AND ar.confirmed = true
         AND ar.present = true
         AND COALESCE(p.status,'active') <> 'merged'`,
      [sessionId, orgId]
    );

    if (!attendanceRes.rows.length) {
      await client.query('COMMIT');
      console.log(`[ARIA] No confirmed present attendance for session ${sessionId}`);
      return { session_id: sessionId, processed: 0 };
    }

    const personIds = new Set();

    for (const row of attendanceRes.rows) {
      const result = await client.query(
        `INSERT INTO participation_records
         (organization_id,person_id,session_id,participation_type,value,occurred_at)
         SELECT $1,$2,$3,'attendance',$4::jsonb,$5
         WHERE NOT EXISTS (
           SELECT 1
           FROM participation_records
           WHERE organization_id = $1
             AND person_id = $2
             AND session_id = $3
             AND participation_type = 'attendance'
         )
         RETURNING person_id`,
        [
          orgId,
          row.people_id,
          sessionId,
          JSON.stringify({
            present: true,
            source: 'attendance_confirmation',
          }),
          row.attendance_date,
        ]
      );

      // Also include existing participation records in the engagement refresh.
      if (result.rows.length || row.people_id) {
        personIds.add(row.people_id);
      }
    }

    await client.query('COMMIT');

    // Metrics are derived data and must never roll back participation.
    for (const personId of personIds) {
      try {
        await updateEngagementMetricsForPerson(personId, orgId);
      } catch (err) {
        console.error(
          `[ARIA] Engagement update failed for person ${personId}:`,
          err
        );
      }
    }

    console.log(
      `[ARIA] Participation generated for session ${sessionId} (${personIds.size} people)`
    );

    return {
      session_id: sessionId,
      processed: personIds.size,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error(
      `[ARIA] Participation generation error for session ${sessionId}:`,
      err
    );
    throw err;
  } finally {
    client.release();
  }
            }
