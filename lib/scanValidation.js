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

// -------- Normalize Name (for duplicate detection) --------
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[0-9]+\.\s*/g, '')           // remove "23. "
    .replace(/\*\*/g, '')                   // remove bold markers
    .replace(/[*\-–—]\s*/g, '')             // remove bullet points
    .replace(/[^a-z\s']/g, '')              // keep only letters, spaces, apostrophes
    .replace(/\s+/g, ' ')                   // collapse spaces
    .trim();
}

// -------- Hard Validation Filters --------
const REASONING_PHRASES = [
  'let\'s', 're-read', 'look at', 'illegible',
  'faint', 'carefully', 'seems to be', 'appears to be',
  'i think', 'i see', 'maybe', 'perhaps',
  'next line', 'previous line', 'hard to read',
  '->', '=>', 'ok', 'yes', 'no', // UPDATED: Removed 'ok', 'yes', 'no'
];

const MARKDOWN_PATTERNS = [
  /\*\*/,           // bold
  /\* /,            // bullet
  /\-\-/,           // dash
  /\n\s*\d+\./,     // numbered list
  /```/,            // code block
  /\[.*\]/,         // brackets
];

function isCorruptedName(name) {
  if (!name) return true;
  const lower = name.toLowerCase();
  // Phrase check
  for (const phrase of REASONING_PHRASES) {
    if (lower.includes(phrase)) return true;
  }
  // Markdown patterns
  for (const pattern of MARKDOWN_PATTERNS) {
    if (pattern.test(name)) return true;
  }
  // Starts with digit + period
  if (/^\d+\./.test(name)) return true;
  // Ends with colon (likely a label)
  if (/.*:\s*$/.test(name)) return true;
  // Too long (real names rarely exceed 50 chars)
  if (name.length > 50) return true;
  // Too short (single letters)
  if (name.length < 2) return true;
  // All special characters
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

// -------- Extract and Parse JSON (STRICT - no fallback) --------
function extractAndParseJSON(text) {
  if (!text) return null;

  // Remove markdown code blocks
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  // Try to find a JSON array
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return null;

  // Try parsing
  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // One repair attempt: fix trailing commas
    const repaired = arrayMatch[0]
      .replace(/,\s*\]/g, ']')
      .replace(/,\s*}/g, '}')
      .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
      .replace(/:\s*'([^']*)'/g, ':"$1"');
    try {
      const parsed = JSON.parse(repaired);
      if (Array.isArray(parsed)) return parsed;
    } catch (e2) {
      return null;
    }
  }
  return null;
}

// -------- LIGHTWEIGHT: Check if raw content contains a valid person array (NO DB) --------
export function isValidPersonArray(rawContent) {
  if (!rawContent) return false;
  const peopleArray = extractAndParseJSON(rawContent);
  if (!peopleArray || peopleArray.length === 0) return false;

  // Check that at least one person has a name
  for (const p of peopleArray) {
    const name = (p.name || p.first_name || p.full_name || '').trim();
    if (name && name.length >= 2 && !isCorruptedName(name)) {
      return true;
    }
  }
  return false;
}

// -------- Validate a Single Person --------
function validatePerson(obj) {
  const name = (obj.name || obj.first_name || obj.full_name || '').trim();
  const rawPhone = (obj.phone || obj.mobile || '').trim();
  const phone = normalizePhone(rawPhone);

  // Hard validation: reject corrupted names
  if (isCorruptedName(name)) {
    return { valid: false, reason: 'Corrupted name pattern' };
  }

  // Phone must be valid if provided
  if (phone && phone.length < 10) {
    return { valid: false, reason: 'Invalid phone number' };
  }

  return {
    valid: true,
    data: { name, phone, original_phone: rawPhone },
  };
}

// -------- Duplicate Detection (normalized) --------
async function findDuplicates(orgId, name, phone) {
  const normalizedIncoming = normalizeName(name);

  // 1. Exact phone match (highest priority)
  if (phone) {
    const result = await pool.query(
      `SELECT id, first_name, phone, status, type FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
      [orgId, phone]
    );
    if (result.rows.length > 0) {
      return { match: true, person: result.rows[0], confidence: 'high' };
    }
  }

  // 2. Fuzzy name match (using normalized names)
  if (name) {
    const allPeople = await pool.query(
      `SELECT id, first_name, phone, status, type FROM people WHERE organization_id = $1`,
      [orgId]
    );
    for (const p of allPeople.rows) {
      const normalizedExisting = normalizeName(p.first_name);
      // Exact normalized match
      if (normalizedIncoming === normalizedExisting) {
        return { match: true, person: p, confidence: 'high' };
      }
      // Fuzzy match
      const similarity = fuzzyMatch(normalizedIncoming, normalizedExisting);
      if (similarity > 0.8) {
        return { match: true, person: p, confidence: 'medium' };
      }
    }
  }

  return { match: false };
}

// -------- Main Validation Pipeline (Full) --------
export async function validateScanOutput(rawContent, orgId, programName) {
  // Step 1: Extract JSON
  const peopleArray = extractAndParseJSON(rawContent);

  // Step 2: If no JSON array found, FAIL the scan
  if (!peopleArray || peopleArray.length === 0) {
    console.log('No valid JSON array found in vision response. Raw:', rawContent?.substring(0, 200));
    return {
      valid: false,
      error: 'ARIA could not read this register clearly. Please try again with a clearer photo.',
      people: [],
      duplicates: [],
      needsReview: [],
      total_extracted: 0,
      total_valid: 0,
    };
  }

  // Step 3: Validate each person
  const validatedPeople = [];
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

    // Duplicate check (uses normalized comparison)
    const dup = await findDuplicates(orgId, name, phone);
    if (dup.match) {
      duplicates.push({ ...validation.data, existing: dup.person, confidence: dup.confidence });
      if (dup.confidence === 'high') {
        continue; // Skip insertion, will update existing later
      } else {
        needsReview.push({ ...validation.data, existing: dup.person });
        continue;
      }
    }

    // Determine relationship stage
    let relationshipStage = 'new_visitor';
    if (phone) {
      const existing = await pool.query(
        `SELECT id, created_at FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
        [orgId, phone]
      );
      if (existing.rows.length > 0) {
        const attendanceCount = await pool.query(
          `SELECT COUNT(*) as cnt FROM attendance_records ar
           JOIN people p ON ar.member_id = p.id
           WHERE p.id = $1 AND ar.present = true`,
          [existing.rows[0].id]
        );
        const total = parseInt(attendanceCount.rows[0].cnt) || 0;
        if (total <= 2) relationshipStage = 'first_time';
        else if (total >= 5) relationshipStage = 'regular';
        else relationshipStage = 'returning';
      }
    } else if (name) {
      const similar = await pool.query(
        `SELECT id FROM people WHERE organization_id = $1 AND first_name ILIKE $2 LIMIT 1`,
        [orgId, `%${name}%`]
      );
      if (similar.rows.length > 0) relationshipStage = 'familiar_face';
    }

    validatedPeople.push({
      name,
      phone,
      relationship_stage: relationshipStage,
      needs_review: (relationshipStage === 'new_visitor'),
    });
  }

  return {
    valid: true,
    people: validatedPeople,
    duplicates,
    needsReview,
    total_extracted: peopleArray.length,
    total_valid: validatedPeople.length,
  };
      }
