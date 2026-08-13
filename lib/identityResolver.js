// lib/identityResolver.js
import pool from './db';
import { fuzzyMatch } from './fuzzyMatch';
import { normalizeName, normalizePhone } from './scanValidation';
import { getThreshold } from './identityConfig';

// ── Constants ──
const ALIVE_THRESHOLD = 80;
const NEEDS_DECISION_THRESHOLD = 60;
const CONFLICT_DIFFERENCE = 10;
const AUTO_CONFIRM_PHONE_THRESHOLD = 70;

/**
 * Resolve identities for an array of extracted people.
 * Returns enriched people and review items.
 */
export async function resolveIdentities(extractedPeople, orgId, scanJobId) {
  const needsReview = [];
  const resolvedPeople = [];

  for (const person of extractedPeople) {
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

    // 3. Fuzzy name match (only if we have few candidates)
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

    // Deduplicate by id, keep highest score
    const uniqueCandidates = [];
    const seen = new Set();
    for (const c of candidates) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        uniqueCandidates.push(c);
      }
    }
    uniqueCandidates.sort((a, b) => b.score - a.score);

    // ── Determine status ──
    let status = 'alive';
    let candidateIds = uniqueCandidates.map(c => c.id);
    let bestScore = uniqueCandidates.length > 0 ? uniqueCandidates[0].score : 0;

    if (uniqueCandidates.length === 0) {
      // No candidate → genuinely new (but we still treat as needs_decision to be safe)
      status = 'needs_decision';
    } else if (uniqueCandidates.length >= 2) {
      const topScore = uniqueCandidates[0].score;
      const secondScore = uniqueCandidates[1].score;
      if (topScore - secondScore <= CONFLICT_DIFFERENCE) {
        status = 'conflict';
      } else if (topScore < NEEDS_DECISION_THRESHOLD) {
        status = 'needs_decision';
      } else if (topScore < ALIVE_THRESHOLD) {
        status = 'needs_decision';
      }
      // else alive
    } else {
      // Single candidate
      if (bestScore < NEEDS_DECISION_THRESHOLD) {
        status = 'needs_decision';
      } else if (bestScore < ALIVE_THRESHOLD) {
        status = 'needs_decision';
      }
      // else alive
    }

    // ── Auto‑resolve if possible ──
    let resolved = false;
    let resolvedPersonId = null;
    let resolutionAction = null;

    if (status === 'alive' && uniqueCandidates.length === 1) {
      // Auto‑save: attach to the existing person
      resolved = true;
      resolvedPersonId = uniqueCandidates[0].id;
      resolutionAction = 'auto_confirm';
    } else if (status === 'needs_decision' && normalizedPhone && uniqueCandidates.length === 1) {
      // If phone exact match and score is high enough, auto‑resolve
      const top = uniqueCandidates[0];
      if (top.method === 'phone' && top.score >= AUTO_CONFIRM_PHONE_THRESHOLD) {
        resolved = true;
        resolvedPersonId = top.id;
        resolutionAction = 'auto_phone_confirm';
        status = 'alive'; // demote to alive
      }
    }

    // ── Build review item (always store, even if resolved) ──
    const reviewItem = {
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
      resolved,
      resolved_person_id: resolvedPersonId,
      resolution_action: resolutionAction,
      created_at: new Date().toISOString(),
    };

    needsReview.push(reviewItem);

    // ── For resolved items, mark the person for immediate saving ──
    if (resolved && resolvedPersonId) {
      resolvedPeople.push({
        ...person,
        resolved_person_id: resolvedPersonId,
        status,
        candidate_ids: candidateIds,
      });
    } else {
      // Not resolved – will be treated as new or sent to review
      resolvedPeople.push({
        ...person,
        resolved: false,
        status,
        candidate_ids: candidateIds,
      });
    }
  }

  return { needsReview, resolvedPeople };
       }
