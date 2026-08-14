// lib/aria/observers/phoneSimilarityObserver.js
import pool from '../../db';
import { normalizePhone } from '../../phoneUtils';

/**
 * Normalise Nigerian phone numbers to a consistent format:
 * - Remove spaces, dashes, parentheses.
 * - Strip leading '0' or country code '+234' or '234'.
 * - Result is a string of digits only, starting with the network code.
 */
function normalizeNigerianPhone(phone) {
  if (!phone) return null;
  // Remove everything except digits
  let digits = phone.replace(/\D/g, '');
  // If it starts with '234' (country code) and length > 10, strip it
  if (digits.startsWith('234') && digits.length > 10) {
    digits = digits.slice(3);
  }
  // If it starts with '0' and length == 11 (e.g., 08123456789), strip the leading '0'
  if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }
  // If it starts with '+' or any other char, we've already stripped non-digits
  return digits;
}

/**
 * Observer that finds near‑duplicate phone numbers (1‑3 digit differences).
 * Generates evidence for each pair of people whose phones are very similar.
 * 
 * Evidence: phone numbers that differ by only a few digits, likely OCR errors.
 */
export async function generatePhoneSimilarityObservations(orgId) {
  const observations = [];

  // Get all active people with phones
  const res = await pool.query(
    `SELECT id, phone FROM people 
     WHERE organization_id = $1 AND status = 'active' AND phone IS NOT NULL AND phone != ''`,
    [orgId]
  );
  const people = res.rows.map(p => ({
    id: p.id,
    phone: normalizeNigerianPhone(p.phone),
  }));

  // Filter out nulls
  const validPeople = people.filter(p => p.phone !== null && p.phone.length >= 10);

  // O(n^2) – but phones are few; we can optimize later with indexing
  for (let i = 0; i < validPeople.length; i++) {
    for (let j = i + 1; j < validPeople.length; j++) {
      const a = validPeople[i];
      const b = validPeople[j];
      if (!a.phone || !b.phone) continue;
      
      // After normalisation, lengths should match for same phone format
      // But we allow a length difference of at most 1 (e.g., one missing digit)
      const lenDiff = Math.abs(a.phone.length - b.phone.length);
      if (lenDiff > 1) continue; // too different

      // Align lengths by padding the shorter with leading zeros? Actually we want exact comparison
      // but if lengths differ by 1, we can try to align from the right (last digits)
      // For simplicity, we'll only compare if lengths are equal OR if one is missing a digit at the start
      // Most common: missing leading 0 or country code already handled, so lengths should be equal.
      // But if they differ by 1, we can shift and check if all digits match except one.
      let phoneA = a.phone;
      let phoneB = b.phone;
      if (phoneA.length !== phoneB.length) {
        // Try to align by padding the shorter with a leading '0'? Not needed after normalization.
        // Instead, we skip; this case is rare.
        continue;
      }

      let diffCount = 0;
      for (let k = 0; k < phoneA.length; k++) {
        if (phoneA[k] !== phoneB[k]) diffCount++;
        if (diffCount > 3) break;
      }

      if (diffCount === 0) continue; // exact duplicate handled elsewhere
      if (diffCount > 3) continue; // too different

      let confidence = 0;
      if (diffCount === 1) confidence = 85;
      else if (diffCount === 2) confidence = 70;
      else if (diffCount === 3) confidence = 55;

      observations.push({
        person_id: a.id,
        type: 'similar_phone',
        confidence,
        observed_at: new Date().toISOString(),
        evidence: {
          phone_a: a.phone,
          phone_b: b.phone,
          digit_difference: diffCount,
          matched_person_id: b.id,
        },
      });
      observations.push({
        person_id: b.id,
        type: 'similar_phone',
        confidence,
        observed_at: new Date().toISOString(),
        evidence: {
          phone_a: b.phone,
          phone_b: a.phone,
          digit_difference: diffCount,
          matched_person_id: a.id,
        },
      });
    }
  }
  return observations;
}
