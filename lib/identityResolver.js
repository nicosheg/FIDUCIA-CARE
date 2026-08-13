// lib/identityResolver.js
import pool from './db';
import { fuzzyMatch, normalizeName, normalizePhone } from './scanValidation';
import { getThreshold } from './identityConfig';

const ALIVE_THRESHOLD = 80;
const NEEDS_DECISION_THRESHOLD = 60;
const CONFLICT_DIFFERENCE = 10;

export async function resolveIdentities(extractedPeople, orgId, scanJobId) {
  const results = [];

  for (let idx = 0; idx < extractedPeople.length; idx++) {
    const person = extractedPeople[idx];
    const { name, phone, confidence } = person;
    const normalizedName = normalizeName(name);
    const normalizedPhone = normalizePhone(phone);

    // ── Find candidates ──
    const candidates = [];

    // 1. Exact phone match
    if (normalizedPhone) {
      const phoneMatch = await pool.query(
        `SELECT id, first_name, phone FROM people
         WHERE organization_id = $1 AND phone = $2 AND status = 'active'`,
        [orgId, normalizedPhone]
      );
      phoneMatch.rows.forEach(row => {
        candidates.push({ ...row, score: 95, method: 'phone' });
      });
    }

    // 2. Alias match
    const aliasMatch = await pool.query(
      `SELECT pa.person_id, p.first_name, p.phone
       FROM person_aliases pa
       JOIN people p ON pa.person_id = p.id
       WHERE pa.organization_id = $1 AND pa.alias = $2 AND p.status = 'active'`,
      [orgId, normalizedName]
    );
    aliasMatch.rows.forEach(row => {
      candidates.push({ id: row.person_id, first_name: row.first_name, phone: row.phone, score: 85, method: 'alias' });
    });

    // 3. Fuzzy name match
    if (candidates.length < 3) {
      const allPeople = await pool.query(
        `SELECT id, first_name, phone FROM people WHERE organization_id = $1 AND status = 'active'`,
        [orgId]
      );
      for (const p of allPeople.rows) {
        const similarity = fuzzyMatch(normalizedName, normalizeName(p.first_name));
        if (similarity > 0.6) {
          candidates.push({ ...p, score: Math.round(similarity * 100), method: 'fuzzy' });
        }
      }
    }

    // Deduplicate
    const uniqueCandidates = [];
    const seen = new Set();
    for (const c of candidates) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        uniqueCandidates.push(c);
      }
    }
    uniqueCandidates.sort((a, b) => b.score - a.score);

    const candidateIds = uniqueCandidates.map(c => c.id);
    let bestScore = uniqueCandidates.length > 0 ? uniqueCandidates[0].score : 0;
    let status = 'new';
    let bestCandidateId = null;

    // ── Status logic ──
    if (uniqueCandidates.length === 0) {
      status = 'new';
    } else if (uniqueCandidates.length >= 2) {
      const topScore = uniqueCandidates[0].score;
      const secondScore = uniqueCandidates[1].score;
      if (topScore - secondScore <= CONFLICT_DIFFERENCE) {
        status = 'conflict';
      } else if (topScore < NEEDS_DECISION_THRESHOLD) {
        status = 'needs_decision';
      } else if (topScore < ALIVE_THRESHOLD) {
        status = 'needs_decision';
      } else {
        // Phone missing → needs_decision, not alive
        if (!normalizedPhone) {
          status = 'needs_decision';
        } else {
          status = 'alive';
          bestCandidateId = uniqueCandidates[0].id;
        }
      }
    } else {
      // Single candidate
      if (bestScore < NEEDS_DECISION_THRESHOLD) {
        status = 'needs_decision';
      } else if (bestScore < ALIVE_THRESHOLD) {
        status = 'needs_decision';
      } else {
        if (!normalizedPhone) {
          status = 'needs_decision';
        } else {
          status = 'alive';
          bestCandidateId = uniqueCandidates[0].id;
        }
      }
    }

    const reviewId = `${scanJobId}:${idx}`;

    results.push({
      extracted_name: name,
      extracted_phone: phone || null,
      confidence: confidence || 70,
      status,
      candidate_ids: candidateIds,
      candidates: uniqueCandidates.map(c => ({
        id: c.id,
        name: c.first_name,
        phone: c.phone,
        score: c.score,
        method: c.method,
      })),
      best_candidate_id: bestCandidateId,
      resolved: false,
      review_id: reviewId,
    });
  }

  return results;
            }
