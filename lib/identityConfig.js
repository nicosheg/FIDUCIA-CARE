// lib/identityConfig.js
export const IDENTITY_CONFIG = {
  // Match thresholds
  EXACT_PHONE_CONFIDENCE: 0.98,
  EXACT_NAME_CONFIDENCE: 0.95,
  STRONG_FUZZY_CONFIDENCE: 0.85,
  MEDIUM_FUZZY_CONFIDENCE: 0.75,

  // Decision thresholds
  AUTO_SAVE_THRESHOLD: 0.90,
  REVIEW_THRESHOLD: 0.75,

  // MVP: full table scan for fuzzy matching
  // TODO: Replace with indexed search in Priority 2
  USE_FULL_TABLE_FUZZY: true,
};

export function getThreshold(thresholdName) {
  return IDENTITY_CONFIG[thresholdName] || 0.75;
    }
