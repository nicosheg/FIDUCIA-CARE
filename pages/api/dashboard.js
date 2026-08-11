import pool from '../../lib/db';

export default async function handler(req, res) {
  const orgId = req.query.organization_id || 'demo-org';
  const today = new Date().toISOString().slice(0, 10);

  try {
    // Basic counts
    const attendanceRes = await pool.query(
      `SELECT ar.present
       FROM attendance_records ar
       JOIN people p ON ar.people_id = p.id
       WHERE p.organization_id = $1 AND ar.attendance_date = $2`,
      [orgId, today]
    );
    const todaysCommunity = attendanceRes.rows.filter(r => r.present).length;
    const needCare = attendanceRes.rows.filter(r => !r.present).length;

    // Ambient insight – e.g., first‑time absences or a notable pattern
    let ambientInsight = null;
    if (needCare > 0) {
      ambientInsight = `${needCare} people missed today – most are first‑time absences.`;
    }

    res.json({
      todaysCommunity,
      needCare,
      ambientInsight,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
}
