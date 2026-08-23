// lib/confidenceUtils.js

/**
 * Normalize a confidence score to a valid integer between 0 and 100.
 * @param {number} value - Raw confidence value
 * @param {number} defaultVal - Fallback if invalid
 * @returns {number} - Normalized confidence
 */
export function normalizeConfidence(value, defaultVal = 70) {
  let val = parseInt(value, 10);
  // Treat NaN, negative, or zero as invalid -> use default
  if (isNaN(val) || val <= 0) val = defaultVal;
  if (val > 100) val = 100;
  return val;
}
