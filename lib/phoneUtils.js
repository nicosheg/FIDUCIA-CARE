// lib/phoneUtils.js

/**
 * Normalize phone numbers to a canonical format.
 *
 * Contract:
 * - empty/whitespace → null
 * - Nigerian 080... → +23480...
 * - Nigerian 234... → +234...
 * - existing +234... → unchanged
 * - other international numbers (+123...) → unchanged (supported but documented)
 * - invalid values (too short, non-numeric, malformed) → null
 *
 * This ensures that the same phone number is stored consistently,
 * preventing duplicate records due to formatting differences.
 */
export function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  let cleaned = phone.trim();
  if (cleaned === '') return null;
  // Remove all non-digit except leading '+'
  let digits = cleaned.replace(/[^\d+]/g, '');
  // If it doesn't start with '+', we attempt Nigerian normalization
  if (!digits.startsWith('+')) {
    if (digits.startsWith('0')) {
      digits = '+234' + digits.substring(1);
    } else if (digits.startsWith('234')) {
      digits = '+' + digits;
    }
    // If it doesn't match Nigerian pattern, we keep it as-is if it looks like a valid number
    // but we'll validate length later.
  }
  // Validate length: at least 10 digits (excluding +) and at most 15
  const numberPart = digits.replace('+', '');
  if (numberPart.length < 10 || numberPart.length > 15) {
    return null;
  }
  return digits;
      }
