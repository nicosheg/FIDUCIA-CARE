// pages/api/attendance/mark.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { session_id, people_id, present } = req.body;
    if (!session_id || !people_id) {
        return res.status(400).json({ error: 'Missing session_id or people_id' });
    }

    const orgId = req.org.id;
    const userId = req.user.id;

    // 1. Verify the user is assigned to this session
    const assignment = await pool.query(
        `SELECT 1 FROM session_users WHERE session_id = $1 AND user_id = $2`,
        [session_id, userId]
    );
    if (assignment.rows.length === 0) {
        return res.status(403).json({ error: 'You are not assigned to this session.' });
    }

    // 2. Verify session belongs to org
    const sessionCheck = await pool.query(
        `SELECT id FROM sessions WHERE id = $1 AND organization_id = $2`,
        [session_id, orgId]
    );
    if (sessionCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Session not found in your organization.' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Insert/update attendance_records (always present=true, confirmed=false)
        await client.query(
            `INSERT INTO attendance_records (
                people_id, attendance_date, present, session_id, marked_by, marked_at, confirmed
             ) VALUES ($1, $2, true, $3, $4, NOW(), false)
             ON CONFLICT (people_id, attendance_date) DO UPDATE SET
                present = true,
                session_id = EXCLUDED.session_id,
                marked_by = EXCLUDED.marked_by,
                marked_at = NOW(),
                confirmed = false`,
            [people_id, today, session_id, userId]
        );

        await client.query('COMMIT');
        res.status(200).json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Mark error:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});
