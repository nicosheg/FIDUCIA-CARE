import pool from '../../../lib/db';

export default async function handler(req, res) {
  const { q, usher_id, session_id, group_id, organization_id } = req.query;
  const orgId = organization_id || 'demo-org';

  let people = [];
  if (usher_id) {
    // Progressive recognition: recently marked by this usher
    const recent = await pool.query(
      `SELECT DISTINCT p.id, p.first_name, p.phone, p.type
       FROM people p
       JOIN usher_marks um ON um.people_id = p.id
       WHERE p.organization_id = $1 AND um.usher_id = $2
       ORDER BY um.created_at DESC LIMIT 20`,
      [orgId, usher_id]
    );
    people = recent.rows;
  } else if (q) {
    // Fast search – case‑insensitive, any word
    const words = q.trim().split(/\s+/);
    if (words.length > 0) {
      let query = `SELECT id, first_name, phone, type FROM people WHERE organization_id = $1 AND (`;
      const params = [orgId];
      words.forEach((word, i) => {
        if (i > 0) query += ' AND ';
        query += `(first_name ILIKE $${i + 2} OR phone ILIKE $${i + 2})`;
        params.push(`%${word}%`);
      });
      query += `) ORDER BY first_name LIMIT 30`;
      const result = await pool.query(query, params);
      people = result.rows;
    }
  } else {
    // No search, return all active people (limited)
    const result = await pool.query(
      `SELECT id, first_name, phone, type FROM people WHERE organization_id = $1 AND status = 'active' ORDER BY first_name LIMIT 100`,
      [orgId]
    );
    people = result.rows;
  }

  res.status(200).json(people);
}
