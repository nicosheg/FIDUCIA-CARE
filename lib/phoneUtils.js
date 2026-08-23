// lib/phoneUtils.js

/**
 * Normalize a Nigerian phone number.
 *
 * Returns E.164-style +234XXXXXXXXXX or null.
 */
function normalizePhone(phone) {
  if (phone === null || phone === undefined) return null;

  const raw = String(phone).trim();
  if (!raw) return null;

  let cleaned = raw
    .replace(/\s+/g, '')
    .replace(/[^0-9+]/g, '');

  if (!cleaned) return null;

  // +2348012345678
  if (cleaned.startsWith('+')) {
    const digits = cleaned.substring(1).replace(/\D/g, '');

    if (digits.length < 10 || digits.length > 15) {
      return null;
    }

    return `+${digits}`;
  }

  // 08012345678
  if (cleaned.startsWith('0')) {
    const local = cleaned.substring(1);

    if (!/^\d{10}$/.test(local)) {
      return null;
    }

    return `+234${local}`;
  }

  // 2348012345678
  if (cleaned.startsWith('234')) {
    if (!/^234\d{10}$/.test(cleaned)) {
      return null;
    }

    return `+${cleaned}`;
  }

  // 8012345678
  if (/^\d{10}$/.test(cleaned)) {
    return `+234${cleaned}`;
  }

  return null;
}

// IMPORTANT:
// Export BOTH named and default.
// This removes ambiguity between different import styles/bundling.
export { normalizePhone };
export default normalizePhone;
