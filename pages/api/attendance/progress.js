// pages/api/attendance/progress.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });

    const orgId = req.org.id;

    try {
        // Get total active people in org (or people assigned to this session?)
        // For MVP, we count all active people.
        const totalRes = await pool.query(
            `SELECT COUNT(*) as total FROM people WHERE organization_id = $1 AND status = 'active'`,
            [orgId]
        );
        const total = parseInt(totalRes.rows[0].total) || 0;

        const markedRes = await pool.query(
            `SELECT COUNT(DISTINCT people_id) as marked
             FROM attendance_records
             WHERE session_id = $1 AND present = true`,
            [session_id]
        );
        const marked = parseInt(markedRes.rows[0].marked) || 0;

        res.status(200).json({ total, marked });
    } catch (err) {
        console.error('Progress error:', err);
        res.status(500).json({ error: err.message });
    }
});
