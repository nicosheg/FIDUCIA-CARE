// lib/scanValidation.js
// Canonical AI-output validation and identity resolution.
// IMPORTANT: This module NEVER writes attendance or absence.

import pool from './db';
import { getThreshold } from './identityConfig';
import normalizePhone from './phoneUtils';
import { normalizeConfidence } from './confidenceUtils';

export const MAX_PEOPLE_PER_SCAN = 500;

export function fuzzyMatch(a, b) {
  if (!a || !b) return 0;
  a = String(a).toLowerCase().trim();
  b = String(b).toLowerCase().trim();
  if (a === b) return 1;
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  const maxLen = Math.max(a.length, b.length);
  return maxLen ? 1 - matrix[a.length][b.length] / maxLen : 0;
}

export function normalizeName(name) {
  if (!name) return '';
  return String(name)
    .toLowerCase()
    .replace(/[0-9]+\.\s*/g, '')
    .replace(/\*\*/g, '')
    .replace(/[*\-–—]\s*/g, '')
    .replace(/[^a-z\s']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export { normalizePhone };

const REASONING_PHRASES = [
  "let's", 're-read', 'look at', 'illegible', 'faint', 'carefully',
  'seems to be', 'appears to be', 'i think', 'i see', 'maybe', 'perhaps',
  'next line', 'previous line', 'hard to read', '->', '=>',
];

const MARKDOWN_PATTERNS = [/\*\*/, /\* /, /\-\-/, /\n\s*\d+\./, /```/];

function isCorruptedName(name) {
  if (!name) return true;
  const lower = name.toLowerCase();
  if (REASONING_PHRASES.some(p => lower.includes(p))) return true;
  if (MARKDOWN_PATTERNS.some(p => p.test(name))) return true;
  if (/^\d+\./.test(name) || /.*:\s*$/.test(name)) return true;
  if (name.length > 60 || name.length < 2) return true;
  if (/^[^a-zA-Z]+$/.test(name)) return true;
  if ((name.match(/[.!?]/g) || []).length > 1) return true;
  return false;
}

function validatePhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { valid: false, reason: 'unreadable', needsReview: true };
  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 10) return { valid: false, reason: 'too_short', needsReview: true };
  if (digits.length > 15) return { valid: false, reason: 'too_long', needsReview: true };
  if (/^(\d)\1+$/.test(digits)) return { valid: false, reason: 'invalid_format', needsReview: true };
  return { valid: true, phone: normalized };
}

function extractAndParseJSON(text) {
  if (!text) return null;
  let cleaned = String(text).replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const parse = value => {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.people)) return parsed.people;
    } catch {}
    return null;
  };

  const direct = parse(cleaned);
  if (direct) return direct;

  const starts = [cleaned.indexOf('['), cleaned.indexOf('{')].filter(i => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);

  let stack = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];

    if (c === '"' && !escaped) inString = !inString;
    escaped = c === '\\' && !escaped;

    if (inString) continue;

    if (c === '[' || c === '{') stack.push(c);
    else if (c === ']' && stack.at(-1) === '[') stack.pop();
    else if (c === '}' && stack.at(-1) === '{') stack.pop();

    if (!stack.length) {
      const parsed = parse(cleaned.slice(start, i + 1));
      if (parsed) return parsed;
      break;
    }
  }

  const repaired = cleaned.slice(start)
    .replace(/,\s*\]/g, ']')
    .replace(/,\s*}/g, '}')
    .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
    .replace(/:\s*'([^']*)'/g, ':"$1"');

  return parse(repaired);
}

async function resolveIdentity(orgId, name, phone, evaluation = false) {
  if (evaluation) return { match: false, confidence: 0, method: 'evaluation' };

  const normName = normalizeName(name);
  const normPhone = normalizePhone(phone);
  const EXACT_PHONE = getThreshold('EXACT_PHONE_CONFIDENCE');
  const EXACT_NAME = getThreshold('EXACT_NAME_CONFIDENCE');
  const STRONG_FUZZY = getThreshold('STRONG_FUZZY_CONFIDENCE');
  const MEDIUM_FUZZY = getThreshold('MEDIUM_FUZZY_CONFIDENCE');

  if (normPhone) {
    const phoneResult = await pool.query(
      `SELECT id, first_name, phone, type, status
       FROM people
       WHERE organization_id = $1 AND phone = $2
       LIMIT 1`,
      [orgId, normPhone]
    );
    if (phoneResult.rows.length) {
      return { match: true, person: phoneResult.rows[0], confidence: EXACT_PHONE, method: 'phone' };
    }
  }

  if (!normName) return { match: false, confidence: 0, method: 'none' };

  const peopleResult = await pool.query(
    `SELECT id, first_name, phone, type, status
     FROM people
     WHERE organization_id = $1 AND status = 'active'`,
    [orgId]
  );

  const ranked = peopleResult.rows
    .map(person => ({
      person,
      similarity: fuzzyMatch(normName, normalizeName(person.first_name)),
    }))
    .sort((a, b) => b.similarity - a.similarity);

  if (!ranked.length) return { match: false, confidence: 0, method: 'none' };

  const best = ranked[0];
  const second = ranked[1];
  const bestPercent = Math.round(best.similarity * 100);
  const secondPercent = second ? Math.round(second.similarity * 100) : 0;
  const margin = bestPercent - secondPercent;

  if (bestPercent >= EXACT_NAME) {
    return { match: true, person: best.person, confidence: EXACT_NAME, method: 'exact_fuzzy' };
  }

  if (bestPercent >= STRONG_FUZZY && (!second || margin >= 8)) {
    return { match: true, person: best.person, confidence: STRONG_FUZZY, method: 'strong_fuzzy' };
  }

  if (bestPercent >= MEDIUM_FUZZY) {
    return {
      match: true,
      person: best.person,
      confidence: MEDIUM_FUZZY,
      method: 'medium_fuzzy',
      ambiguous: !!second && margin < 8,
    };
  }

  return { match: false, confidence: 0, method: 'none' };
}

export async function validateScanOutput(rawContent, orgId, programName, jobId, options = {}) {
  const { evaluation = false } = options;
  const peopleArray = extractAndParseJSON(rawContent);

  if (!Array.isArray(peopleArray)) {
    return {
      valid: false,
      error: 'Invalid AI response: expected an array of people.',
      people: [], duplicates: [], needsReview: [], rejected: [],
      total_extracted: 0, total_valid: 0,
    };
  }

  if (peopleArray.length > MAX_PEOPLE_PER_SCAN) {
    return {
      valid: false,
      error: `Too many people extracted (${peopleArray.length}). Please ensure the register is a single page.`,
      people: [], duplicates: [], needsReview: [], rejected: [],
      total_extracted: peopleArray.length, total_valid: 0,
    };
  }

  const results = {
    people: [], duplicates: [], needsReview: [], rejected: [],
    total_extracted: peopleArray.length,
  };

  const AUTO_SAVE = getThreshold('AUTO_SAVE_THRESHOLD');
  const REVIEW = getThreshold('REVIEW_THRESHOLD');
  const validatedPeople = [];

  for (const raw of peopleArray) {
    if (!raw || typeof raw !== 'object') {
      results.rejected.push({ name: '', phone: '', reason: 'Invalid person object' });
      continue;
    }

    const name = String(raw.name || raw.first_name || '').trim();
    const rawPhone = String(raw.phone || '').trim();
    const phoneValidation = validatePhone(rawPhone);
    const phone = phoneValidation.valid ? phoneValidation.phone : null;

    if (isCorruptedName(name)) {
      results.rejected.push({ name, phone: rawPhone, reason: 'Corrupted name pattern' });
      continue;
    }

    if (name.length < 2) {
      results.rejected.push({ name: rawPhone || 'Unknown', phone: rawPhone, reason: 'No valid name' });
      continue;
    }

    let confidence;
    if (!phone && rawPhone) confidence = 30;
    else if (!phone) confidence = 40;
    else confidence = name.split(/\s+/).length >= 2 ? 70 : 60;

    validatedPeople.push({
      name,
      phone,
      rawPhone,
      confidence,
      needsReview: !phone,
    });
  }

  const seenPhones = new Set();
  const seenNames = new Set();
  const uniquePeople = [];

  for (const person of validatedPeople) {
    const phoneKey = person.phone ? normalizePhone(person.phone) : null;
    const nameKey = normalizeName(person.name);
    if (phoneKey && seenPhones.has(phoneKey)) continue;
    if (!phoneKey && seenNames.has(nameKey)) continue;
    if (phoneKey) seenPhones.add(phoneKey);
    if (nameKey) seenNames.add(nameKey);
    uniquePeople.push(person);
  }

  for (const person of uniquePeople) {
    const identity = await resolveIdentity(orgId, person.name, person.phone, evaluation);

    if (identity.match) {
      if (identity.confidence >= AUTO_SAVE && !identity.ambiguous) {
        results.duplicates.push({
          incoming: { name: person.name, phone: person.phone || person.rawPhone },
          existing: identity.person,
          confidence: identity.confidence,
          method: identity.method,
        });
        continue;
      }

      if (identity.confidence >= REVIEW) {
        results.needsReview.push({
          incoming: { name: person.name, phone: person.phone || person.rawPhone },
          existing: identity.person,
          confidence: identity.confidence,
          method: identity.method,
          ambiguous: !!identity.ambiguous,
          reason: identity.ambiguous ? 'Multiple possible existing people' : 'Possible existing person',
        });
        continue;
      }
    }

    if (person.needsReview) {
      results.needsReview.push({
        incoming: { name: person.name, phone: person.phone || person.rawPhone },
        confidence: person.confidence,
        relationship_stage: 'uncertain',
        reason: 'Phone number could not be safely validated',
      });
      continue;
    }

    results.people.push({
      name: person.name,
      phone: person.phone,
      type: 'visitor',
      relationship_stage: 'first_time_visitor',
      confidence: normalizeConfidence(person.confidence, 70),
      needs_review: false,
    });
  }

  results.total_valid =
    results.people.length +
    results.duplicates.length +
    results.needsReview.length;

  return {
    valid: true,
    people: results.people,
    duplicates: results.duplicates,
    needsReview: results.needsReview,
    rejected: results.rejected,
    total_extracted: results.total_extracted,
    total_valid: results.total_valid,
  };
    }
