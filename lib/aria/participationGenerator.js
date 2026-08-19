// lib/aria/participationGenerator.js
import pool from '../db';
import { updateEngagementMetricsForPerson } from './engagementIntelligence';

export async function generateParticipationFromSession(sessionId, orgId) {
    const client = await pool.connect();
    try {
        // Get all confirmed attendance for this session
        const res = await client.query(
            `SELECT people_id, present, attendance_date
             FROM attendance_records
             WHERE session_id = $1 AND confirmed = true`,
            [sessionId]
        );

        const people = res.rows;
        if (people.length === 0) {
            console.log(`No confirmed attendance for session ${sessionId}`);
            return;
        }

        const personIds = [];

        for (const row of people) {
            const { people_id, present, attendance_date } = row;
            // Upsert participation_records
            await client.query(
                `INSERT INTO participation_records (
                    organization_id, person_id, participation_date, present, session_id, confirmed_at
                 ) VALUES ($1, $2, $3, $4, $5, NOW())
                 ON CONFLICT (person_id, participation_date, organization_id) DO UPDATE SET
                    present = EXCLUDED.present,
                    session_id = EXCLUDED.session_id,
                    confirmed_at = NOW()`,
                [orgId, people_id, attendance_date, present, sessionId]
            );
            personIds.push(people_id);
        }

        // Recalculate engagement metrics for each affected person (batch update)
        // We'll update metrics per person, not full organization recalc
        for (const pid of personIds) {
            await updateEngagementMetricsForPerson(pid, orgId);
        }

        console.log(`Participation generated for session ${sessionId} (${personIds.length} people)`);
    } catch (err) {
        console.error('Participation generation error:', err);
        throw err;
    } finally {
        client.release();
    }
}
