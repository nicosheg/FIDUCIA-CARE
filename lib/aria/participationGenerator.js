// lib/aria/participationGenerator.js
import pool from '../db';
import { updateEngagementMetricsForPerson } from './engagementIntelligence';

export async function generateParticipationFromSession(sessionId, orgId) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        /*
         * Only confirmed attendance belonging to this organization
         * can become participation.
         *
         * Absence is not participation, so only PRESENT records qualify.
         */
        const attendanceRes = await client.query(
            `SELECT
                ar.people_id,
                ar.attendance_date,
                ar.present
             FROM attendance_records ar
             WHERE ar.session_id = $1
               AND ar.organization_id = $2
               AND ar.confirmed = true
               AND ar.present = true`,
            [sessionId, orgId]
        );

        if (attendanceRes.rows.length === 0) {
            await client.query('COMMIT');

            console.log(
                `No confirmed present attendance for session ${sessionId}`
            );

            return {
                session_id: sessionId,
                processed: 0,
            };
        }

        const personIds = new Set();

        for (const row of attendanceRes.rows) {
            const personId = row.people_id;

            /*
             * Do not create participation for an identity that no longer
             * exists as an active canonical person in this organization.
             */
            const personCheck = await client.query(
                `SELECT id
                 FROM people
                 WHERE id = $1
                   AND organization_id = $2
                   AND status <> 'merged'`,
                [personId, orgId]
            );

            if (personCheck.rows.length === 0) continue;

            /*
             * Current frozen participation schema:
             *
             * organization_id
             * person_id
             * session_id
             * participation_type
             * value
             * occurred_at
             * created_at
             *
             * Attendance is a domain participation fact. ARIA can interpret
             * it later rather than treating every attendance row as an
             * observation.
             */
            await client.query(
                `INSERT INTO participation_records
                 (
                    organization_id,
                    person_id,
                    session_id,
                    participation_type,
                    value,
                    occurred_at
                 )
                 SELECT
                    $1,
                    $2,
                    $3,
                    'attendance',
                    $4::jsonb,
                    $5
                 WHERE NOT EXISTS (
                    SELECT 1
                    FROM participation_records
                    WHERE organization_id = $1
                      AND person_id = $2
                      AND session_id = $3
                      AND participation_type = 'attendance'
                 )`,
                [
                    orgId,
                    personId,
                    sessionId,
                    JSON.stringify({
                        present: true,
                        source: 'attendance_confirmation',
                    }),
                    row.attendance_date,
                ]
            );

            personIds.add(personId);
        }

        await client.query('COMMIT');

        /*
         * Engagement calculations happen only after participation has
         * successfully committed. A metric failure must not roll back
         * the source-of-truth participation transaction.
         */
        for (const personId of personIds) {
            try {
                await updateEngagementMetricsForPerson(
                    personId,
                    orgId
                );
            } catch (err) {
                console.error(
                    `Engagement update failed for person ${personId}:`,
                    err
                );
            }
        }

        console.log(
            `Participation generated for session ${sessionId} (${personIds.size} people)`
        );

        return {
            session_id: sessionId,
            processed: personIds.size,
        };
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error(
                'Participation rollback failed:',
                rollbackError
            );
        }

        console.error(
            `Participation generation error for session ${sessionId}:`,
            err
        );

        throw err;
    } finally {
        client.release();
    }
}
