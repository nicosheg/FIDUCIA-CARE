import pool from './db';

// -------- Simple Fuzzy Matching (inline) --------
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

// -------- Normalize Name --------
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[0-9]+\.\s*/g, '')
    .replace(/\*\*/g, '')
    .replace(/[*\-–—]\s*/g, '')
    .replace(/[^a-z\s']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// -------- Hard Validation Filters (removed 'ok','yes','no') --------
const REASONING_PHRASES = [
  'let\'s', 're-read', 'look at', 'illegible',
  'faint', 'carefully', 'seems to be', 'appears to be',
  'i think', 'i see', 'maybe', 'perhaps',
  'next line', 'previous line', 'hard to read',
  '->', '=>'
];

const MARKDOWN_PATTERNS = [
  /\*\*/,
  /\* /,
  /\-\-/,
  /\n\s*\d+\./,
  /```/,
  /\[.*\]/,
];

function isCorruptedName(name) {
  if (!name) return true;
  const lower = name.toLowerCase();
  for (const phrase of REASONING_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  for (const pattern of MARKDOWN_PATTERNS) {
    if (pattern.test(name)) return true;
  }
  if (/^\d+\./.test(name)) return true;
  if (/.*:\s*$/.test(name)) return true;
  if (name.length > 50) return true;
  if (name.length < 2) return true;
  if (/^[^a-zA-Z]+$/.test(name)) return true;
  return false;
}

// -------- Normalize Phone --------
function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('0')) cleaned = '+234' + cleaned.substring(1);
  else if (cleaned.startsWith('234') && !cleaned.startsWith('+')) cleaned = '+' + cleaned;
  if (cleaned === '+234' || cleaned.length < 10) cleaned = '';
  return cleaned;
}

// -------- Extract and Parse JSON (strict) --------
function extractAndParseJSON(text) {
  if (!text) return null;
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return null;
  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    const repaired = arrayMatch[0]
      .replace(/,\s*\]/g, ']')
      .replace(/,\s*}/g, '}')
      .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
      .replace(/:\s*'([^']*)'/g, ':"$1"');
    try {
      const parsed = JSON.parse(repaired);
      if (Array.isArray(parsed)) return parsed;
    } catch (e2) { return null; }
  }
  return null;
}

// -------- Lightweight check (no DB) --------
export function isValidPersonArray(rawContent) {
  if (!rawContent) return false;
  const peopleArray = extractAndParseJSON(rawContent);
  if (!peopleArray || peopleArray.length === 0) return false;
  for (const p of peopleArray) {
    const name = (p.name || p.first_name || p.full_name || '').trim();
    if (name && name.length >= 2 && !isCorruptedName(name)) return true;
  }
  return false;
}

// -------- Validate a single person --------
function validatePerson(obj) {
  const name = (obj.name || obj.first_name || obj.full_name || '').trim();
  const rawPhone = (obj.phone || obj.mobile || '').trim();
  const phone = normalizePhone(rawPhone);
  if (isCorruptedName(name)) return { valid: false, reason: 'Corrupted name pattern' };
  if (phone && phone.length < 10) return { valid: false, reason: 'Invalid phone number' };
  return { valid: true, data: { name, phone, original_phone: rawPhone } };
}

// -------- Duplicate detection with merging (returns existing person and whether to update) --------
async function findDuplicate(orgId, name, phone, jobId) {
  const normalizedIncoming = normalizeName(name);

  // 1. Exact phone match (high confidence)
  if (phone) {
    const result = await pool.query(
      `SELECT id, first_name, phone, type, status FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
      [orgId, phone]
    );
    if (result.rows.length > 0) {
      return { match: true, person: result.rows[0], confidence: 'high' };
    }
  }

  // 2. Fuzzy name match (threshold 0.7)
  if (name) {
    const allPeople = await pool.query(
      `SELECT id, first_name, phone, type, status FROM people WHERE organization_id = $1`,
      [orgId]
    );
    for (const p of allPeople.rows) {
      const normalizedExisting = normalizeName(p.first_name);
      if (normalizedIncoming === normalizedExisting) {
        return { match: true, person: p, confidence: 'high' };
      }
      const similarity = fuzzyMatch(normalizedIncoming, normalizedExisting);
      if (similarity > 0.7) {
        return { match: true, person: p, confidence: 'medium' };
      }
    }
  }
  return { match: false };
}

// -------- Main validation pipeline (full) --------
export async function validateScanOutput(rawContent, orgId, programName, jobId) {
  const peopleArray = extractAndParseJSON(rawContent);
  if (!peopleArray || peopleArray.length === 0) {
    return {
      valid: false,
      error: 'ARIA could not read the register clearly. Please try again with a clearer photo.',
      people: [],
      duplicates: [],
      needsReview: [],
      total_extracted: 0,
      total_valid: 0,
    };
  }

  const validated = [];
  const duplicates = [];
  const needsReview = [];

  for (const p of peopleArray) {
    const phone = normalizePhone(p.phone);
    const name = (p.name || p.first_name || '').trim();
    const validation = validatePerson({ name, phone });
    if (!validation.valid) {
      console.warn('Skipping invalid person:', validation.reason, name);
      continue;
    }

    // Check duplicate
    const dup = await findDuplicate(orgId, name, phone);
    if (dup.match) {
      // Record duplicate info (will be used to update existing person)
      duplicates.push({
        incoming: validation.data,
        existing: dup.person,
        confidence: dup.confidence,
      });
      if (dup.confidence === 'high') {
        // We will update the existing person later, not insert new
        continue;
      } else {
        // Medium confidence – flag for review but still we can update
        needsReview.push({ incoming: validation.data, existing: dup.person });
        continue;
      }
    }

    // Determine relationship stage
    let relationshipStage = 'new_visitor';
    let type = 'visitor';
    if (phone) {
      const existing = await pool.query(
        `SELECT id, type FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
        [orgId, phone]
      );
      if (existing.rows.length > 0) {
        // Preserve existing type
        type = existing.rows[0].type;
        relationshipStage = 'returning';
        // Maybe count attendance to refine later
      }
    }
    // If no phone, but name match found, we might set familiar_face
    if (relationshipStage === 'new_visitor' && name) {
      const similar = await pool.query(
        `SELECT id FROM people WHERE organization_id = $1 AND first_name ILIKE $2 LIMIT 1`,
        [orgId, `%${name}%`]
      );
      if (similar.rows.length > 0) {
        relationshipStage = 'familiar_face';
        // We should fetch type from that existing person
        const p = await pool.query(`SELECT type FROM people WHERE id = $1`, [similar.rows[0].id]);
        if (p.rows.length > 0) type = p.rows[0].type;
      }
    }

    validated.push({
      name,
      phone,
      relationship_stage: relationshipStage,
      type: type, // preserve existing type if any
      needs_review: (relationshipStage === 'new_visitor'),
    });
  }

  return {
    valid: true,
    people: validated,
    duplicates: duplicates, // now contains full duplicate info for update
    needsReview,
    total_extracted: peopleArray.length,
    total_valid: validated.length,
  };
        }
