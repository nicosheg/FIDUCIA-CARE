// lib/confidenceUtils.js

/**
 * Normalize a confidence value to a number between 0 and 100.
 * If value is already between 0 and 100, return it as-is.
 * If value is between 0 and 1, multiply by 100.
 * If value is undefined or null, return the fallback.
 */
export function normalizeConfidence(value, fallback = 70) {
  if (value === undefined || value === null || isNaN(value)) {
    return fallback;
  }
  let num = Number(value);
  if (num >= 0 && num <= 100) {
    return Math.round(num);
  }
  if (num >= 0 && num <= 1) {
    return Math.round(num * 100);
  }
  return fallback;
}
