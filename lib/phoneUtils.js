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

  if (cleaned.startsWith('+')) {
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 10) return null;
    return cleaned;
  }
  if (cleaned.startsWith('0')) {
    const local = cleaned.substring(1);
    if (local.length < 10) return null;
    return '+234' + local;
  }
  if (cleaned.startsWith('234')) {
    if (cleaned.length >= 13) return '+' + cleaned;
    return null;
  }
  if (/^\d{10}$/.test(cleaned)) {
    return '+234' + cleaned;
  }
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
