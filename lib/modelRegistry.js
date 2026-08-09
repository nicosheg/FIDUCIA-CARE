// lib/modelRegistry.js
/**
 * FIDUCIA model registry.
 * One authoritative configuration per model key.
 * All configurations are immutable and validated at load time.
 */

const REQUIRED_FIELDS = [
  'provider',
  'model',
  'max_completion_tokens',
  'input_cost_per_1k',
  'output_cost_per_1k',
  'version',
  'effective_from',
  'capabilities',
  'supports_reasoning_effort',
  'supports_json_object',
  'supports_structured_output',
  'estimated_input_tokens_per_scan',
  'estimated_output_tokens_per_scan',
];

function validateModelConfig(key, config) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in config)) {
      throw new Error(`modelRegistry: model "${key}" missing required field "${field}"`);
    }
  }

  // Type checks – including NaN/Infinity for numeric fields
  if (typeof config.provider !== 'string') throw new Error(`modelRegistry: ${key}.provider must be a string`);
  if (typeof config.model !== 'string') throw new Error(`modelRegistry: ${key}.model must be a string`);
  if (!Number.isInteger(config.max_completion_tokens) || config.max_completion_tokens <= 0) {
    throw new Error(`modelRegistry: ${key}.max_completion_tokens must be a positive integer`);
  }
  if (typeof config.input_cost_per_1k !== 'number' || !Number.isFinite(config.input_cost_per_1k) || config.input_cost_per_1k < 0) {
    throw new Error(`modelRegistry: ${key}.input_cost_per_1k must be a non‑negative finite number`);
  }
  if (typeof config.output_cost_per_1k !== 'number' || !Number.isFinite(config.output_cost_per_1k) || config.output_cost_per_1k < 0) {
    throw new Error(`modelRegistry: ${key}.output_cost_per_1k must be a non‑negative finite number`);
  }
  if (typeof config.version !== 'string') throw new Error(`modelRegistry: ${key}.version must be a string`);
  if (typeof config.effective_from !== 'string') throw new Error(`modelRegistry: ${key}.effective_from must be a string`);
  if (!Array.isArray(config.capabilities)) throw new Error(`modelRegistry: ${key}.capabilities must be an array`);
  if (typeof config.supports_reasoning_effort !== 'boolean') throw new Error(`modelRegistry: ${key}.supports_reasoning_effort must be a boolean`);
  if (typeof config.supports_json_object !== 'boolean') throw new Error(`modelRegistry: ${key}.supports_json_object must be a boolean`);
  if (typeof config.supports_structured_output !== 'boolean') throw new Error(`modelRegistry: ${key}.supports_structured_output must be a boolean`);
  if (!Number.isInteger(config.estimated_input_tokens_per_scan) || config.estimated_input_tokens_per_scan <= 0) {
    throw new Error(`modelRegistry: ${key}.estimated_input_tokens_per_scan must be a positive integer`);
  }
  if (!Number.isInteger(config.estimated_output_tokens_per_scan) || config.estimated_output_tokens_per_scan <= 0) {
    throw new Error(`modelRegistry: ${key}.estimated_output_tokens_per_scan must be a positive integer`);
  }
}

const rawRegistry = {
  'groq-qwen3.6-27b': {
    provider: 'groq',
    model: 'qwen/qwen3.6-27b',
    max_completion_tokens: 4096,
    input_cost_per_1k: 0.0006,
    output_cost_per_1k: 0.0030,
    version: '1.0',
    effective_from: '2026-01-01',
    capabilities: ['vision', 'json_mode', 'reasoning_control'],
    supports_reasoning_effort: true,
    supports_json_object: true,
    supports_structured_output: false,
    estimated_input_tokens_per_scan: 2000,
    estimated_output_tokens_per_scan: 1000,
  },
};

// Validate all entries
for (const [key, config] of Object.entries(rawRegistry)) {
  validateModelConfig(key, config);
}

// Freeze each config and the registry
const frozenRegistry = {};
for (const [key, config] of Object.entries(rawRegistry)) {
  frozenRegistry[key] = Object.freeze({ ...config });
}
export const MODEL_REGISTRY = Object.freeze(frozenRegistry);

export function getModelConfig(modelKey) {
  const config = MODEL_REGISTRY[modelKey];
  if (!config) {
    throw new Error(`modelRegistry: unknown model key "${modelKey}"`);
  }
  return config;
}
