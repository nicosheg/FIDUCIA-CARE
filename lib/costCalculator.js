// lib/costCalculator.js
/**
 * FIDUCIA cost calculator.
 * Uses separate input and output token pricing from the model registry.
 * All inputs are strictly validated; invalid inputs cause explicit errors.
 */

import { getModelConfig } from './modelRegistry';

// ----- Validation helpers -----

function validateTokens(tokens, label) {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens)) {
    throw new Error(`costCalculator: ${label} must be a finite number (got ${typeof tokens})`);
  }
  if (tokens < 0) {
    throw new Error(`costCalculator: ${label} cannot be negative (got ${tokens})`);
  }
  // Floor to integer (API tokens are integers; this ensures we don't propagate decimals)
  return Math.floor(tokens);
}

// ----- Public API -----

export function calculateEstimatedCost(modelKey, inputTokens = 0, outputTokens = 0) {
  const config = getModelConfig(modelKey); // throws if unknown

  const safeInput = validateTokens(inputTokens, 'inputTokens');
  const safeOutput = validateTokens(outputTokens, 'outputTokens');

  const inputCost = (safeInput / 1000) * config.input_cost_per_1k;
  const outputCost = (safeOutput / 1000) * config.output_cost_per_1k;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  };
}

export function calculateConservativeReservation(modelKey) {
  const config = getModelConfig(modelKey); // throws if unknown

  const estimatedInput = config.estimated_input_tokens_per_scan;
  const estimatedOutput = config.estimated_output_tokens_per_scan;

  const safetyMargin = 1.20;
  const reservedInput = Math.ceil(estimatedInput * safetyMargin);
  const reservedOutput = Math.ceil(estimatedOutput * safetyMargin);

  return calculateEstimatedCost(
    modelKey,
    reservedInput,
    reservedOutput
  ).totalCost;
}
