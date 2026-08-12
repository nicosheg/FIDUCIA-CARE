// lib/confidenceUtils.js
/**
 * Normalize any confidence value to an integer in the range 0–100.
 * - If value is 0–1, multiply by 100 and round.
 * - If value is >1, round to integer.
 * - Clamp to 0–100.
 * - Invalid values return the default (70).
 */
export function normalizeConfidence(value, defaultVal = 70) {
  if (value === null || value === undefined || typeof value !== 'number' || isNaN(value)) {
    return defaultVal;
  }
  let val = value;
  if (val >= 0 && val <= 1) {
    val = Math.round(val * 100);
  } else {
    val = Math.round(val);
  }
  return Math.min(100, Math.max(0, val));
  }
