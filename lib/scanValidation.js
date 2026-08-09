// lib/scanValidation.js – Full validation pipeline with identity resolution

import pool from './db';
import crypto from 'crypto';

// ---- Helpers ----
function fuzzyMatch(a, b) {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase().trim(), s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  const matrix = [];
  for (let i = 0; i <= s1.length; i++) matrix[i] = [i];
  for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i-1] === s2[j-1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i-1][j]+1, matrix[i][j-1]+1, matrix[i-1][j-1]+cost);
    }
  }
  const d = matrix[s1.length][s2.length];
  const maxLen = Math.max(s1.length, s2.length);
  return maxLen > 0 ? 1 - d / maxLen : 0;
}

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

// ---- Reasoning detection ----
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
  // multiple sentences
  if ((name.match(/[.!?]/g) || []).length > 1) return true;
  return false;
}

function validatePerson(obj) {
  const name = (obj.name || obj.first_name || obj.full_name || '').trim();
  const rawPhone = (obj.phone || obj.mobile || '').trim();
  const phone = normalizePhone(rawPhone);
  if (isCorruptedName(name)) return { valid: false, reason: 'Corrupted name pattern' };
  if (phone && phone.length < 10) return { valid: false, reason: 'Invalid phone number' };
  return { valid: true, data: { name, phone, original_phone: rawPhone } };
}

// ---- Extract JSON ----
function extractAndParseJSON(text) {
  if (!text) return null;
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try { const parsed = JSON.parse(match[0]); if (Array.isArray(parsed)) return parsed; } catch (e) {
    const repaired = match[0].replace(/,\s*\]/g, ']').replace(/,\s*}/g, '}')
      .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
      .replace(/:\s*'([^']*)'/g, ':"$1"');
    try { const parsed = JSON.parse(repaired); if (Array.isArray(parsed)) return parsed; } catch (e2) { return null; }
  }
  return null;
}

// ---- Lightweight JSON validity ----
export function isValidPersonArray(raw) {
  if (!raw) return false;
  const arr = extractAndParseJSON(raw);
  if (!arr || arr.length === 0) return false;
  for (const p of arr) {
    const name = (p.name || p.first_name || '').trim();
    if (name && name.length >= 2 && !isCorruptedName(name)) return true;
  }
  return false;
}

// ---- Identity Resolution ----
async function resolveIdentity(orgId, name, phone) {
  const normName = normalizeName(name);
  const normPhone = normalizePhone(phone);

  // 1. Exact phone match
  if (normPhone) {
    const res = await pool.query(
      `SELECT id, first_name, phone, type, status FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
      [orgId, normPhone]
    );
    if (res.rows.length > 0) {
      return { match: true, person: res.rows[0], confidence: 'high', method: 'phone' };
    }
  }

  // 2. Fuzzy name match
  if (name) {
    const all = await pool.query(`SELECT id, first_name, phone, type, status FROM people WHERE organization_id = $1`, [orgId]);
    for (const p of all.rows) {
      const normExisting = normalizeName(p.first_name);
      if (normName === normExisting) {
        return { match: true, person: p, confidence: 'high', method: 'name_exact' };
      }
      const sim = fuzzyMatch(normName, normExisting);
      if (sim > 0.75) {
        return { match: true, person: p, confidence: 'medium', method: 'name_fuzzy', score: sim };
      }
    }
  }

  return { match: false };
}

// ---- Main validation pipeline ----
export async function validateScanOutput(rawContent, orgId, programName, jobId) {
  const peopleArray = extractAndParseJSON(rawContent);
  if (!peopleArray || peopleArray.length === 0) {
    return {
      valid: false,
      error: 'ARIA could not read the register clearly. Please try again with a clearer photo.',
      people: [], duplicates: [], needsReview: [], total_extracted: 0, total_valid: 0,
    };
  }

  const results = {
    people: [],      // will be inserted as new
    duplicates: [],  // existing with update
    needsReview: [], // uncertain
    total_extracted: peopleArray.length,
  };

  for (const raw of peopleArray) {
    const name = (raw.name || raw.first_name || '').trim();
    const phone = normalizePhone(raw.phone);
    const val = validatePerson({ name, phone });
    if (!val.valid) {
      console.warn('Skipping invalid person:', val.reason, name);
      continue;
    }

    // Resolve identity
    const identity = await resolveIdentity(orgId, name, phone);
    if (identity.match) {
      if (identity.confidence === 'high') {
        results.duplicates.push({
          incoming: { name, phone },
          existing: identity.person,
          confidence: 'high',
        });
      } else {
        // medium confidence – need review
        results.needsReview.push({
          incoming: { name, phone },
          existing: identity.person,
          confidence: identity.confidence,
          score: identity.score,
        });
      }
      continue;
    }

    // New person: determine classification
    let type = 'visitor';
    let relationshipStage = 'new_visitor';
    // We can check if phone exists in DB (should be none) but we already did.

    results.people.push({
      name,
      phone,
      type,
      relationship_stage: relationshipStage,
      needs_review: false,
    });
  }

  results.total_valid = results.people.length + results.duplicates.length + results.needsReview.length;

  return {
    valid: true,
    people: results.people,
    duplicates: results.duplicates,
    needsReview: results.needsReview,
    total_extracted: results.total_extracted,
    total_valid: results.total_valid,
  };
       }
