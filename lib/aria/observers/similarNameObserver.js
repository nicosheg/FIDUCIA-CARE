// lib/aria/observers/similarNameObserver.js
import pool from '../../db';

/**
 * Simple Levenshtein distance to compute similarity ratio.
 */
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i-1] === a[j-1]) {
        matrix[i][j] = matrix[i-1][j-1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i-1][j-1] + 1,
          matrix[i][j-1] + 1,
          matrix[i-1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Fuzzy match: returns a similarity score between 0 and 1.
 */
function fuzzyMatch(str1, str2) {
  if (!str1 || !str2) return 0;
  const a = str1.toLowerCase().trim();
  const b = str2.toLowerCase().trim();
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const maxLen = Math.max(a.length, b.length);
  const dist = levenshtein(a, b);
  return 1 - (dist / maxLen);
}

/**
 * Normalize name: lowercase, remove punctuation, collapse spaces.
 */
function normalizeName(name = '') {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize common titles (Bro, Sis, Pastor, etc.) to improve matching.
 */
function normalizeTitle(name) {
  const titleRegex = /^(bro|brother|sis|sister|mrs|ms|mr|pastor|deacon|evangelist|prophet|apostle|elder)\s+/i;
  return name.replace(titleRegex, '').trim();
}

/**
 * Observer that finds similar full names using fuzzy matching.
 * Normalizes titles before comparison.
 * Compares first_name + last_name (concatenated with a space).
 * Generates observations for each person in a similar pair.
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

  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i];
      const b = people[j];
      const normA = normalizeTitle(normalizeName(a.full_name));
      const normB = normalizeTitle(normalizeName(b.full_name));
      const sim = fuzzyMatch(normA, normB);
      if (sim > 0.7) {
        const confidence = Math.round(sim * 95);
        observations.push({
          person_id: a.id,
          type: 'similar_name',
          confidence,
          observed_at: new Date().toISOString(),
          evidence: {
            matched_name: b.full_name,
            normalized_matched: normB,
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
            normalized_matched: normA,
            similarity: sim,
          },
        });
      }
    }
  }
  return observations;
    }
