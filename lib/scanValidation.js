// lib/scanValidation.js
import pool from './db';
import { getThreshold } from './identityConfig';

// -------- Hard limit --------
export const MAX_PEOPLE_PER_SCAN = 500;

// -------- Simple fuzzy match (Levenshtein-based) --------
function fuzzyMatch(str1, str2) {
  if (!str1 || !str2) return 0;
  const a = str1.toLowerCase().trim();
  const b = str2.toLowerCase().trim();
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matrix = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  const distance = matrix[a.length][b.length];
  const maxLen = Math.max(a.length, b.length);
  return maxLen > 0 ? 1 - distance / maxLen : 0;
}

// -------- Normalization --------
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[0-9]+\.\s*/g, '')
    .replace(/\*\*/g, '')
    .replace(/[*\-–—]\s*/g, '')
    .replace(/[^a-z\s']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('0')) cleaned = '+234' + cleaned.substring(1);
  else if (cleaned.startsWith('234') && !cleaned.startsWith('+')) cleaned = '+' + cleaned;
  if (cleaned === '+234' || cleaned.length < 10) cleaned = '';
  return cleaned;
}

// -------- Reasoning Detection --------
const REASONING_PHRASES = [
  'let\'s', 're-read', 'look at', 'illegible', 'faint',
  'carefully', 'seems to be', 'appears to be', 'i think',
  'i see', 'maybe', 'perhaps', 'next line', 'previous line',
  'hard to read', '->', '=>'
];
const MARKDOWN_PATTERNS = [/\*\*/, /\* /, /\-\-/, /\n\s*\d+\./, /```/, /\[.*\]/];

function isCorruptedName(name) {
  if (!name) return true;
  const lower = name.toLowerCase();
  for (const phrase of REASONING_PHRASES) if (lower.includes(phrase)) return true;
  for (const pat of MARKDOWN_PATTERNS) if (pat.test(name)) return true;
  if (/^\d+\./.test(name)) return true;
  if (/.*:\s*$/.test(name)) return true;
  if (name.length > 60) return true;
  if (name.length < 2) return true;
  if (/^[^a-zA-Z]+$/.test(name)) return true;
  if ((name.match(/[.!?]/g) || []).length > 1) return true;
  return false;
}

// -------- Phone Validation (never invent) --------
function validatePhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { valid: false, reason: 'unreadable', needsReview: true };
  }
  if (normalized.length < 10) {
    return { valid: false, reason: 'too_short', needsReview: true };
  }
  if (normalized.length > 15) {
    return { valid: false, reason: 'too_long', needsReview: true };
  }
  const digits = normalized.replace(/\D/g, '');
  if (/^(\d)\1+$/.test(digits)) {
    return { valid: false, reason: 'invalid_format', needsReview: true };
  }
  return { valid: true, phone: normalized };
}

// -------- Extract JSON --------
function extractAndParseJSON(text) {
  if (!text) return null;
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.people && Array.isArray(parsed.people)) return parsed.people;
    return null;
  } catch (e) {
    const repaired = match[0]
      .replace(/,\s*\]/g, ']')
      .replace(/,\s*}/g, '}')
      .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
      .replace(/:\s*'([^']*)'/g, ':"$1"');
    try {
      const parsed = JSON.parse(repaired);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.people && Array.isArray(parsed.people)) return parsed.people;
      return null;
    } catch (e2) { return null; }
  }
}

// -------- Lightweight validity (no DB) --------
export function isValidPersonArray(raw) {
  if (!raw) return false;
  const arr = extractAndParseJSON(raw);
  if (arr && Array.isArray(arr)) return true;
  return false;
}

// -------- Identity Resolution (full table scan – MVP limitation) --------
// TODO: Replace with indexed search in Priority 2
async function resolveIdentity(orgId, name, phone, evaluation = false) {
  if (evaluation) {
    return { match: false, confidence: 0 };
  }

  const normName = normalizeName(name);
  const normPhone = normalizePhone(phone);

  const EXACT_PHONE = getThreshold('EXACT_PHONE_CONFIDENCE');
  const EXACT_NAME = getThreshold('EXACT_NAME_CONFIDENCE');
  const STRONG_FUZZY = getThreshold('STRONG_FUZZY_CONFIDENCE');
  const MEDIUM_FUZZY = getThreshold('MEDIUM_FUZZY_CONFIDENCE');

  if (normPhone) {
    const res = await pool.query(
      `SELECT id, first_name, phone, type, status FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
      [orgId, normPhone]
    );
    if (res.rows.length > 0) {
      return { match: true, person: res.rows[0], confidence: EXACT_PHONE, method: 'phone' };
    }
  }

  if (name) {
    const all = await pool.query(`SELECT id, first_name, phone, type, status FROM people WHERE organization_id = $1`, [orgId]);
    let bestMatch = null;

    for (const p of all.rows) {
      const normExisting = normalizeName(p.first_name);
      const sim = fuzzyMatch(normName, normExisting);
      if (!bestMatch || sim > bestMatch.similarity) {
        bestMatch = { person: p, similarity: sim };
      }
    }

    if (bestMatch) {
      const sim = bestMatch.similarity;
      if (sim >= EXACT_NAME) {
        return { match: true, person: bestMatch.person, confidence: EXACT_NAME, method: 'exact_fuzzy' };
      } else if (sim >= STRONG_FUZZY) {
        return { match: true, person: bestMatch.person, confidence: STRONG_FUZZY, method: 'strong_fuzzy' };
      } else if (sim >= MEDIUM_FUZZY) {
        return { match: true, person: bestMatch.person, confidence: MEDIUM_FUZZY, method: 'medium_fuzzy' };
      }
    }
  }

  return { match: false, confidence: 0 };
}

// -------- Main Validation Pipeline --------
export async function validateScanOutput(rawContent, orgId, programName, jobId, options = {}) {
  const { evaluation = false } = options;

  const peopleArray = extractAndParseJSON(rawContent);

  if (!Array.isArray(peopleArray)) {
    return {
      valid: false,
      error: 'Invalid AI response: expected an array of people.',
      people: [],
      duplicates: [],
      needsReview: [],
      rejected: [],
      total_extracted: 0,
      total_valid: 0,
    };
  }

  if (peopleArray.length > MAX_PEOPLE_PER_SCAN) {
    return {
      valid: false,
      error: `Too many people extracted (${peopleArray.length}). Please ensure the register is a single page.`,
      people: [],
      duplicates: [],
      needsReview: [],
      rejected: [],
      total_extracted: peopleArray.length,
      total_valid: 0,
    };
  }

  if (peopleArray.length === 0) {
    return {
      valid: true,
      people: [],
      duplicates: [],
      needsReview: [],
      rejected: [],
      total_extracted: 0,
      total_valid: 0,
    };
  }

  const results = {
    people: [],
    duplicates: [],
    needsReview: [],
    rejected: [],
    total_extracted: peopleArray.length,
  };

  const AUTO_SAVE = getThreshold('AUTO_SAVE_THRESHOLD');
  const REVIEW = getThreshold('REVIEW_THRESHOLD');

  const validatedPeople = [];

  for (const raw of peopleArray) {
    const name = (raw.name || raw.first_name || '').trim();
    const rawPhone = (raw.phone || '').trim();
    const phoneValidation = validatePhone(rawPhone);
    const phone = phoneValidation.valid ? phoneValidation.phone : null;

    if (isCorruptedName(name)) {
      results.rejected.push({ name, phone: rawPhone, reason: 'Corrupted name pattern' });
      continue;
    }
    if (!name || name.length < 2) {
      results.rejected.push({ name: rawPhone || 'Unknown', phone: rawPhone, reason: 'No valid name' });
      continue;
    }

    let needsReview = false;
    let confidence = 0.6;

    if (!phone && rawPhone) {
      needsReview = true;
      confidence = 0.3;
    } else if (!phone) {
      needsReview = true;
      confidence = 0.4;
    }

    if (phone && !needsReview) {
      if (name.split(' ').length >= 2) confidence = 0.7;
      else confidence = 0.6;
    }

    validatedPeople.push({
      name,
      phone,
      rawPhone,
      needsReview,
      confidence,
    });
  }

  // Same‑scan deduplication
  const seenPhones = new Set();
  const seenNames = new Set();
  const uniquePeople = [];

  for (const person of validatedPeople) {
    const phoneKey = person.phone ? normalizePhone(person.phone) : null;
    const nameKey = normalizeName(person.name);

    if (phoneKey && seenPhones.has(phoneKey)) continue;
    if (!phoneKey && seenNames.has(nameKey)) continue;

    if (phoneKey) seenPhones.add(phoneKey);
    seenNames.add(nameKey);

    uniquePeople.push(person);
  }

  for (const person of uniquePeople) {
    const identity = await resolveIdentity(orgId, person.name, person.phone, evaluation);

    if (identity.match) {
      if (identity.confidence >= AUTO_SAVE) {
        results.duplicates.push({
          incoming: { name: person.name, phone: person.phone || person.rawPhone },
          existing: identity.person,
          confidence: identity.confidence,
        });
        continue;
      } else if (identity.confidence >= REVIEW) {
        person.needsReview = true;
        results.needsReview.push({
          incoming: { name: person.name, phone: person.phone || person.rawPhone },
          existing: identity.person,
          confidence: identity.confidence,
        });
        continue;
      }
    }

    let type = 'visitor';
    let relationshipStage = 'new_visitor';

    if (person.phone) {
      type = 'visitor';
      relationshipStage = 'first_time_visitor';
    } else {
      person.needsReview = true;
      person.confidence = 0.4;
      relationshipStage = 'uncertain';
    }

    if (person.needsReview) {
      results.needsReview.push({
        incoming: { name: person.name, phone: person.phone || person.rawPhone },
        confidence: person.confidence,
        relationship_stage: relationshipStage,
      });
    } else {
      results.people.push({
        name: person.name,
        phone: person.phone,
        type,
        relationship_stage: relationshipStage,
        confidence: person.confidence,
        needs_review: false,
      });
    }
  }

  results.total_valid = results.people.length + results.duplicates.length + results.needsReview.length;

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
