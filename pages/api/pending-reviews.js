import pool from '../../lib/db';

export default async function handler(req, res) {
  const churchId = req.query.church_id || req.body?.church_id || 'demo-church';

  try {
    if (req.method === 'GET') {
      const { rows } = await pool.query(
        `SELECT * FROM pending_reviews WHERE church_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
        [churchId]
      );
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { id, action, corrected } = req.body;
      if (action === 'approve') {
        const review = await pool.query('SELECT * FROM pending_reviews WHERE id = $1', [id]);
        if (review.rows.length === 0) return res.status(404).json({ error: 'Not found' });
        const item = review.rows[0];
        const firstName = corrected?.first_name || item.first_name;
        const lastName = corrected?.last_name || item.last_name;
        const phone = corrected?.phone || item.phone;

        await pool.query(
          `INSERT INTO members (church_id, first_name, last_name, phone, status, type)
           VALUES ($1, $2, $3, $4, 'active', 'visitor')`,
          [churchId, firstName, lastName, phone]
        );
        await pool.query(`UPDATE pending_reviews SET status = 'approved' WHERE id = $1`, [id]);
        return res.status(200).json({ success: true });
      } else if (action === 'reject') {
        await pool.query(`UPDATE pending_reviews SET status = 'rejected' WHERE id = $1`, [id]);
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Invalid action' });
    }

    res.status(405).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
          }
