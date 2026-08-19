// pages/api/attendance/review.js
import pool from '../../../lib/db';
import { withAdmin } from '../../../lib/apiHelpers';
import { generateParticipationFromSession } from '../../../lib/aria/participationGenerator';

export default withAdmin(async function handler(req, res) {
    const { session_id } = req.query;
    const orgId = req.org.id;
    const userId = req.user.id;

    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

    // Verify session belongs to org
    const sessionCheck = await pool.query(
        `SELECT id FROM sessions WHERE id = $1 AND organization_id = $2`,
        [session_id, orgId]
    );
    if (sessionCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Session not found' });
    }

    // GET: fetch unconfirmed attendance + anomalies
    if (req.method === 'GET') {
        try {
            const result = await pool.query(
                `SELECT ar.*, p.first_name, p.phone
                 FROM attendance_records ar
                 JOIN people p ON ar.people_id = p.id
                 WHERE ar.session_id = $1 AND ar.confirmed = false`,
                [session_id]
            );
            // For MVP, just return the records; anomalies can be computed in frontend
            res.status(200).json({ records: result.rows });
        } catch (err) {
            console.error('Review fetch error:', err);
            res.status(500).json({ error: err.message });
        }
        return;
    }

    // POST: confirm session
    if (req.method === 'POST') {
        try {
            // Mark all records as confirmed
            await pool.query(
                `UPDATE attendance_records
                 SET confirmed = true, reviewed_by = $1, reviewed_at = NOW()
                 WHERE session_id = $2 AND confirmed = false`,
                [userId, session_id]
            );

            // Trigger participation generation in background (non-blocking)
            setImmediate(() => {
                generateParticipationFromSession(session_id, orgId).catch(err => {
                    console.error('Background participation generation error:', err);
                });
            });

            res.status(200).json({ success: true, message: 'Session confirmed. Participation generation started.' });
        } catch (err) {
            console.error('Confirm session error:', err);
            res.status(500).json({ error: err.message });
        }
        return;
    }

    res.status(405).end();
});
