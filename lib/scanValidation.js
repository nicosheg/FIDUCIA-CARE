import pool from './db';

// -------- Simple Fuzzy Matching (inline, no external dependency) --------
function fuzzyMatch(str1, str2) {
  if (!str1 || !str2) return 0;
  const a = str1.toLowerCase().trim();
  const b = str2.toLowerCase().trim();
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Levenshtein distance
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

// -------- Reasoning Artifact Detection --------
const REASONING_PATTERNS = [
  /<think>/i,
  /<\/think>/i,
  /the user wants me to/i,
  /i will extract/i,
  /let's analyze/i,
  /analyze the image/i,
  /the image shows/i,
  /i need to/i,
  /looking closely/i,
  /i will transcribe/i,
  /wait, /i,
  /perhaps /i,
  /it looks like/i,
  /this is a/i,
  /first, /i,
  /second, /i,
  /third, /i,
  /finally, /i,
  /overall, /i,
  /in summary/i,
];

function isReasoningArtifact(text) {
  if (!text) return false;
  if (text.length > 200) return true;
  for (const pattern of REASONING_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

// -------- Clean Raw AI Output --------
function cleanAIOutput(raw) {
  if (!raw) return '';
  let text = raw;
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/```[\s\S]*?```/g, '');
  text = text.replace(/```json|```/g, '');
  text = text.trim();
  return text;
}

// -------- Extract JSON Array --------
function extractJSONArray(text) {
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return null;
  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    const repaired = arrayMatch[0]
      .replace(/,\s*]/g, ']')
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

// -------- Normalize Phone --------
function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('0')) cleaned = '+234' + cleaned.substring(1);
  else if (cleaned.startsWith('234') && !cleaned.startsWith('+')) cleaned = '+' + cleaned;
  if (cleaned === '+234' || cleaned.length < 10) cleaned = '';
  return cleaned;
}

// -------- Validate a Single Person --------
function validatePerson(obj) {
  const name = (obj.name || obj.first_name || obj.full_name || '').trim();
  const rawPhone = (obj.phone || obj.mobile || '').trim();
  const phone = normalizePhone(rawPhone);

  if (!name || /^[0-9+\-\s]+$/.test(name)) {
    return { valid: false, reason: 'Invalid name' };
  }
  if (name.length > 100) {
    return { valid: false, reason: 'Name too long' };
  }
  if (isReasoningArtifact(name)) {
    return { valid: false, reason: 'Reasoning artifact' };
  }
  if (/<[^>]*>/.test(name) || /```/.test(name) || /\[.*\]/.test(name)) {
    return { valid: false, reason: 'Contains markup' };
  }
  if (phone && phone.length < 10) {
    return { valid: false, reason: 'Invalid phone number' };
  }

  return {
    valid: true,
    data: { name, phone, original_phone: rawPhone },
  };
}

// -------- Duplicate Detection --------
async function findDuplicates(orgId, name, phone) {
  if (phone) {
    const result = await pool.query(
      `SELECT id, first_name, phone, status, type FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
      [orgId, phone]
    );
    if (result.rows.length > 0) {
      return { match: true, person: result.rows[0], confidence: 'high' };
    }
  }

  if (name) {
    const allPeople = await pool.query(
      `SELECT id, first_name, phone, status, type FROM people WHERE organization_id = $1`,
      [orgId]
    );
    for (const p of allPeople.rows) {
      const similarity = fuzzyMatch(name, p.first_name);
      if (similarity > 0.7) {
        return { match: true, person: p, confidence: 'medium' };
      }
    }
  }

  return { match: false };
}

// -------- Main Validation Pipeline --------
export async function validateScanOutput(rawContent, orgId, programName) {
  const cleaned = cleanAIOutput(rawContent);
  let peopleArray = extractJSONArray(cleaned);

  // Fallback: line-by-line
  if (!peopleArray || peopleArray.length === 0) {
    const lines = cleaned.split('\n').filter(l => l.trim().length > 0);
    peopleArray = [];
    for (const line of lines) {
      const phoneMatch = line.match(/(.*?)([0-9+\-\s]{8,})$/);
      const name = phoneMatch ? phoneMatch[1].trim() : line.trim();
      const rawPhone = phoneMatch ? phoneMatch[2].replace(/\s/g, '') : '';
      const validation = validatePerson({ name, phone: rawPhone });
      if (validation.valid) {
        peopleArray.push(validation.data);
      }
    }
  }

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

    const dup = await findDuplicates(orgId, name, phone);
    if (dup.match) {
      duplicates.push({ ...validation.data, existing: dup.person, confidence: dup.confidence });
      if (dup.confidence === 'high') {
        continue;
      } else {
        needsReview.push({ ...validation.data, existing: dup.person });
        continue;
      }
    }

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
