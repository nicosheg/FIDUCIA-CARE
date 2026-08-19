// pages/api/attendance/active-session.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

export default withOrg(async function handler(req, res) {
    const orgId = req.org.id;
    try {
        const result = await pool.query(
            `SELECT id, name FROM sessions
             WHERE organization_id = $1 AND status = 'active'
             ORDER BY created_at DESC LIMIT 1`,
            [orgId]
        );
        if (result.rows.length === 0) {
            return res.status(200).json({ active: false });
        }
        res.status(200).json({ active: true, session_id: result.rows[0].id, name: result.rows[0].name });
    } catch (err) {
        console.error('Active session error:', err);
        res.status(500).json({ error: err.message });
    }
});
