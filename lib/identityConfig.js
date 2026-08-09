// lib/identityConfig.js
/**
 * FIDUCIA identity resolution configuration.
 * All thresholds are immutable and validated at load time.
 * Numeric values must be numbers between 0 and 1 inclusive.
 * USE_FULL_TABLE_FUZZY is a boolean flag.
 */

// Validate numeric thresholds separately from the boolean flag
function validateThresholds(config) {
  const numericKeys = [
    'EXACT_PHONE_CONFIDENCE',
    'EXACT_NAME_CONFIDENCE',
    'STRONG_FUZZY_CONFIDENCE',
    'MEDIUM_FUZZY_CONFIDENCE',
    'AUTO_SAVE_THRESHOLD',
    'REVIEW_THRESHOLD',
  ];

  for (const key of numericKeys) {
    const value = config[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(
        `identityConfig: ${key} must be a finite number (got ${typeof value})`
      );
    }
    if (value < 0 || value > 1) {
      throw new Error(
        `identityConfig: ${key} must be between 0 and 1 (got ${value})`
      );
    }
  }

  if (typeof config.USE_FULL_TABLE_FUZZY !== 'boolean') {
    throw new Error(
      `identityConfig: USE_FULL_TABLE_FUZZY must be a boolean`
    );
  }
}

const rawConfig = {
  EXACT_PHONE_CONFIDENCE: 0.98,
  EXACT_NAME_CONFIDENCE: 0.95,
  STRONG_FUZZY_CONFIDENCE: 0.85,
  MEDIUM_FUZZY_CONFIDENCE: 0.75,
  AUTO_SAVE_THRESHOLD: 0.90,
  REVIEW_THRESHOLD: 0.75,
  USE_FULL_TABLE_FUZZY: true,
};

validateThresholds(rawConfig);

export const IDENTITY_CONFIG = Object.freeze(rawConfig);

export function getThreshold(thresholdName) {
  const value = IDENTITY_CONFIG[thresholdName];
  if (value === undefined) {
    throw new Error(`identityConfig: unknown threshold "${thresholdName}"`);
  }
  return value;
}
