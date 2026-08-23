// lib/phoneUtils.js

/**
 * Normalize phone number: remove non-digit characters,
 * ensure country code prefix if needed (default Nigeria +234).
 *
 * @param {string} phone - Raw phone input
 * @returns {string|null} - Normalized phone number or null if invalid
 */
export function normalizePhone(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
  if (!cleaned) return null;

  // If it already starts with '+', keep as is
  if (cleaned.startsWith('+')) {
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 10) return null;
    return cleaned;
  }

  // If it starts with '0', assume Nigeria local number
  if (cleaned.startsWith('0')) {
    const local = cleaned.substring(1);
    if (local.length < 10) return null;
    return '+234' + local;
  }

  // If it starts with '234' but no '+', prepend '+'
  if (cleaned.startsWith('234')) {
    if (cleaned.length >= 13) return '+' + cleaned;
    return null;
  }

  // If it's a plain 10-digit number, assume Nigeria
  if (/^\d{10}$/.test(cleaned)) {
    return '+234' + cleaned;
  }

  // If it's 11-digit starting with 0, treat as 0XX...
  if (/^0\d{10}$/.test(cleaned)) {
    return '+234' + cleaned.substring(1);
  }

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 13) {
    if (digits.length === 10) return '+234' + digits;
    if (digits.startsWith('234')) return '+' + digits;
    return null;
  }

  return null;
  }
