// lib/aria/participationGenerator.js
// Converts confirmed attendance facts into participation.
// Does NOT interpret attendance or emit observations directly.

import pool from '../db';
import { updateEngagementMetricsForPerson } from './engagementIntelligence';

export async function generateParticipationFromSession(sessionId, orgId) {
  const client = await pool.connect();

  try {
    // Confirm the session belongs to the organization.
    const session = await client.query(
      `SELECT id FROM sessions
       WHERE id=$1 AND organization_id=$2
       LIMIT 1`,
      [sessionId, orgId]
    );

    if (!session.rows.length) {
      throw new Error('Session does not belong to organization.');
    }

    // Only confirmed PRESENT attendance becomes participation.
    const attendance = await client.query(
      `SELECT people_id, attendance_date
       FROM attendance_records
       WHERE session_id=$1 AND confirmed=true AND present=true`,
      [sessionId]
    );

    if (!attendance.rows.length) {
      console.log(`[ARIA] No confirmed participation for session ${sessionId}`);
      return { generated: 0 };
    }

    const personIds = new Set();

    await client.query('BEGIN');

    for (const row of attendance.rows) {
      await client.query(
        `INSERT INTO participation_records
         (organization_id,person_id,participation_date,present,session_id,confirmed_at)
         VALUES ($1,$2,$3,true,$4,NOW())
         ON CONFLICT (person_id,participation_date,organization_id)
         DO UPDATE SET
           present=true,
           session_id=EXCLUDED.session_id,
           confirmed_at=NOW()`,
        [orgId, row.people_id, row.attendance_date, sessionId]
      );

      personIds.add(row.people_id);
    }

    await client.query('COMMIT');

    // Engagement is recalculated from the resulting domain fact.
    for (const personId of personIds) {
      await updateEngagementMetricsForPerson(personId, orgId);
    }

    console.log(
      `[ARIA] Participation generated for session ${sessionId}: ${personIds.size}`
    );

    return { generated: personIds.size };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[ARIA] Participation generation error:', err);
    throw err;
  } finally {
    client.release();
  }
        }
