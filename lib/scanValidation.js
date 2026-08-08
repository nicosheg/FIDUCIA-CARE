import pool from './db';
import { fuzzyMatch } from './fuzzyMatch';

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
  if (text.length > 200) return true; // overly long reasoning
  for (const pattern of REASONING_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

// -------- Clean Raw AI Output --------
function cleanAIOutput(raw) {
  if (!raw) return '';
  let text = raw;
  // Remove <think>...</think> blocks
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Remove markdown code blocks
  text = text.replace(/```[\s\S]*?```/g, '');
  // Remove JSON markers
  text = text.replace(/```json|```/g, '');
  // Remove extra whitespace
  text = text.trim();
  return text;
}

// -------- Extract JSON Array --------
function extractJSONArray(text) {
  // Try to find JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (!arrayMatch) return null;
  try {
    const parsed = JSON.parse(arrayMatch[0]);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // Repair common JSON issues
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

  // Reject if name is empty or only digits
  if (!name || /^[0-9+\-\s]+$/.test(name)) {
    return { valid: false, reason: 'Invalid name' };
  }
  // Reject if name is too long (>100 chars)
  if (name.length > 100) {
    return { valid: false, reason: 'Name too long' };
  }
  // Reject if name looks like reasoning
  if (isReasoningArtifact(name)) {
    return { valid: false, reason: 'Reasoning artifact' };
  }
  // Reject if name contains HTML/XML/Markdown
  if (/<[^>]*>/.test(name) || /```/.test(name) || /\[.*\]/.test(name)) {
    return { valid: false, reason: 'Contains markup' };
  }
  // Phone must be valid if provided
  if (phone && phone.length < 10) {
    return { valid: false, reason: 'Invalid phone number' };
  }

  return {
    valid: true,
    data: {
      name,
      phone,
      original_phone: rawPhone,
    },
  };
}

// -------- Duplicate Detection --------
async function findDuplicates(orgId, name, phone) {
  // 1. Exact phone match (highest priority)
  if (phone) {
    const result = await pool.query(
      `SELECT id, first_name, phone, status FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
      [orgId, phone]
    );
    if (result.rows.length > 0) {
      return { match: true, person: result.rows[0], confidence: 'high' };
    }
  }

  // 2. Fuzzy name match (using existing fuzzyMatch)
  if (name) {
    const allPeople = await pool.query(
      `SELECT id, first_name, phone, status FROM people WHERE organization_id = $1`,
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
  // Step 1: Clean raw AI output
  const cleaned = cleanAIOutput(rawContent);

  // Step 2: Try JSON extraction
  let peopleArray = extractJSONArray(cleaned);

  // Step 3: If JSON fails, try fallback line-by-line (but with validation)
  if (!peopleArray || peopleArray.length === 0) {
    // Use a more conservative fallback: only lines that look like "Name Phone"
    const lines = cleaned.split('\n').filter(l => l.trim().length > 0);
    peopleArray = [];
    for (const line of lines) {
      const phoneMatch = line.match(/(.*?)([0-9+\-\s]{8,})$/);
      const name = phoneMatch ? phoneMatch[1].trim() : line.trim();
      const rawPhone = phoneMatch ? phoneMatch[2].replace(/\s/g, '') : '';
      // Validate immediately
      const validation = validatePerson({ name, phone: rawPhone });
      if (validation.valid) {
        peopleArray.push(validation.data);
      }
    }
  }

  // Step 4: Validate each person
  const validatedPeople = [];
  const duplicates = [];
  const needsReview = [];

  for (const p of peopleArray) {
    // Normalize phone
    const phone = normalizePhone(p.phone);
    const name = (p.name || p.first_name || '').trim();

    // Validate
    const validation = validatePerson({ name, phone });
    if (!validation.valid) {
      // Log warning but skip (do not insert)
      console.warn('Skipping invalid person:', validation.reason, name);
      continue;
    }

    // Duplicate check
    const dup = await findDuplicates(orgId, name, phone);
    if (dup.match) {
      duplicates.push({ ...validation.data, existing: dup.person, confidence: dup.confidence });
      if (dup.confidence === 'high') {
        // High confidence: mark as duplicate, don't insert
        continue;
      } else {
        // Medium confidence: flag for review
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
        // This shouldn't happen because we already checked duplicates, but just in case
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
      // Try name match
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
