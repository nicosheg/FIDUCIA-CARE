// lib/aria/observers/identityObserver.js
import pool from '../../db';

export async function generateIdentityObservations(orgId) {
  const observations = [];

  // 1. Duplicate phone numbers
  const dupQuery = `
    SELECT phone, array_agg(id) as ids, array_agg(first_name) as names
    FROM people
    WHERE organization_id = $1
      AND phone IS NOT NULL
      AND phone != ''
      AND status = 'active'
    GROUP BY phone
    HAVING COUNT(*) > 1
  `;
  const dupRes = await pool.query(dupQuery, [orgId]);

  for (const row of dupRes.rows) {
    const { phone, ids, names } = row;
    for (let i = 0; i < ids.length; i++) {
      const personId = ids[i];
      const otherIds = ids.filter(id => id !== personId);
      observations.push({
        person_id: personId,
        type: 'duplicate_phone',
        confidence: 85,
        evidence: {
          phone: phone,
          other_person_ids: otherIds,
          other_names: names.filter((_, idx) => idx !== i),
        },
      });
    }
  }

  // Future observers can be added here.

  return observations;
}
