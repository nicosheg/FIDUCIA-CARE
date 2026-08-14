// lib/aria/observers/similarNameObserver.js
import pool from '../../db';
import { fuzzyMatch, normalizeName } from '../../scanValidation';

/**
 * Observer that finds similar full names using fuzzy matching.
 * Compares first_name + last_name (concatenated with a space).
 * Generates observations for each person in a similar pair.
 * 
 * Evidence: high similarity between full names of two different people.
 */
export async function generateSimilarNameObservations(orgId) {
  const observations = [];

  const res = await pool.query(
    `SELECT id, first_name, last_name FROM people 
     WHERE organization_id = $1 AND status = 'active'`,
    [orgId]
  );
  const people = res.rows.map(p => ({
    id: p.id,
    full_name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
  }));

  // O(n^2) – suitable for < 1000 people; we can optimize later if needed
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i];
      const b = people[j];
      const sim = fuzzyMatch(normalizeName(a.full_name), normalizeName(b.full_name));
      if (sim > 0.7) { // similarity threshold
        const confidence = Math.round(sim * 95); // map to 0-95
        observations.push({
          person_id: a.id,
          type: 'similar_name',
          confidence,
          observed_at: new Date().toISOString(),
          evidence: {
            matched_name: b.full_name,
            similarity: sim,
          },
        });
        observations.push({
          person_id: b.id,
          type: 'similar_name',
          confidence,
          observed_at: new Date().toISOString(),
          evidence: {
            matched_name: a.full_name,
            similarity: sim,
          },
        });
      }
    }
  }
  return observations;
}
