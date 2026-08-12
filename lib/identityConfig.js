// lib/identityConfig.js
export const IDENTITY_CONFIG = {
  EXACT_PHONE_CONFIDENCE: 98,
  EXACT_NAME_CONFIDENCE: 95,
  STRONG_FUZZY_CONFIDENCE: 85,
  MEDIUM_FUZZY_CONFIDENCE: 75,
  AUTO_SAVE_THRESHOLD: 90,
  REVIEW_THRESHOLD: 75,
  USE_FULL_TABLE_FUZZY: true,
};

export function getThreshold(thresholdName) {
  const value = IDENTITY_CONFIG[thresholdName];
  if (value === undefined) {
    throw new Error(`identityConfig: unknown threshold "${thresholdName}"`);
  }
  return value;
}
