// pages/api/attendance/search.js
// Organization-scoped people search for attendance.
// Uses the authenticated user's organization instead of legacy demo-org input.

import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const { q } = req.query;
  const orgId = req.org.id;

  try {
    let people = [];

    if (typeof q === 'string' && q.trim()) {
      const words = q.trim().split(/\s+/);
      const params = [orgId];

      let query = `
        SELECT id, first_name, last_name, phone, type
        FROM people
        WHERE organization_id = $1
          AND status = 'active'
          AND (
      `;

      words.forEach((word, i) => {
        if (i > 0) query += ' AND ';

        query += `(
          first_name ILIKE $${i + 2}
          OR last_name ILIKE $${i + 2}
          OR phone ILIKE $${i + 2}
        )`;

        params.push(`%${word}%`);
      });

      query += `
          )
        ORDER BY first_name ASC, last_name ASC
        LIMIT 100
      `;

      const result = await pool.query(query, params);
      people = result.rows;
    } else {
      const result = await pool.query(
        `
          SELECT id, first_name, last_name, phone, type
          FROM people
          WHERE organization_id = $1
            AND status = 'active'
          ORDER BY first_name ASC, last_name ASC
          LIMIT 100
        `,
        [orgId]
      );

      people = result.rows;
    }

    return res.status(200).json(people);
  } catch (err) {
    console.error('Attendance people search error:', err);

    return res.status(500).json({
      error: 'Could not load people.',
    });
  }
}

export default withOrg(handler);
