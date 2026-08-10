// lib/aiObserver.js
import pool from './db';
import { calculateEstimatedCost } from './costCalculator';

/**
 * Log an AI usage event to the database.
 * Any failure here must NOT crash the calling scan.
 * Invalid token values or cost calculation failures result in NULL fields,
 * never fabricated zero values.
 */
export async function logAIUsage({
  organization_id,
  job_id,
  request_id,
  model_key,
  provider,
  model,
  purpose,
  prompt_version,
  attempt,
  input_tokens = null,
  output_tokens = null,
  latency_ms,
  finish_reason,
  http_status,
  success,
  retry_reason,
  rate_limit_remaining_tokens,
  rate_limit_remaining_requests,
  rate_limit_reset_tokens,
  rate_limit_reset_requests,
  retry_after,
}) {
  const safeInput = (typeof input_tokens === 'number' && Number.isFinite(input_tokens) && input_tokens >= 0) ? input_tokens : null;
  const safeOutput = (typeof output_tokens === 'number' && Number.isFinite(output_tokens) && output_tokens >= 0) ? output_tokens : null;

  if (input_tokens !== null && safeInput === null) {
    console.warn(`AI Observer: invalid input_tokens (${input_tokens}), will log as NULL`);
  }
  if (output_tokens !== null && safeOutput === null) {
    console.warn(`AI Observer: invalid output_tokens (${output_tokens}), will log as NULL`);
  }

  const totalTokens = (safeInput !== null && safeOutput !== null) ? safeInput + safeOutput : null;

  let inputCost = null;
  let outputCost = null;
  let totalCost = null;

  if (safeInput !== null && safeOutput !== null) {
    try {
      const cost = calculateEstimatedCost(model_key, safeInput, safeOutput);

      if (
        typeof cost === 'object' &&
        cost !== null &&
        Number.isFinite(cost.inputCost) &&
        Number.isFinite(cost.outputCost) &&
        Number.isFinite(cost.totalCost) &&
        cost.inputCost >= 0 &&
        cost.outputCost >= 0 &&
        cost.totalCost >= 0
      ) {
        inputCost = cost.inputCost;
        outputCost = cost.outputCost;
        totalCost = cost.totalCost;
      } else {
        console.error('AI Observer: cost calculator returned invalid values', cost);
      }
    } catch (err) {
      console.error('AI Observer: cost calculation failed:', err.message);
    }
  }

  try {
    await pool.query(
      `INSERT INTO ai_usage_events (
        organization_id, job_id, request_id, provider, model, model_key, purpose, prompt_version,
        attempt, input_tokens, output_tokens, total_tokens, latency_ms, finish_reason,
        http_status, success, retry_reason,
        estimated_input_cost, estimated_output_cost, estimated_total_cost,
        rate_limit_remaining_tokens, rate_limit_remaining_requests,
        rate_limit_reset_tokens, rate_limit_reset_requests, retry_after
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)`,
      [
        organization_id, job_id, request_id, provider, model, model_key, purpose, prompt_version,
        attempt, safeInput, safeOutput, totalTokens, latency_ms, finish_reason,
        http_status, success, retry_reason,
        inputCost, outputCost, totalCost,
        rate_limit_remaining_tokens, rate_limit_remaining_requests,
        rate_limit_reset_tokens, rate_limit_reset_requests, retry_after,
      ]
    );
  } catch (err) {
    console.error('AI Observer: failed to log usage:', err.message);
  }
}

export async function updateExtractionMetrics(requestId, extractionCount, validationCount, reviewCount) {
  if (!requestId) return;
  try {
    await pool.query(
      `UPDATE ai_usage_events
       SET extraction_metrics = jsonb_set(
         jsonb_set(
           jsonb_set(
             COALESCE(extraction_metrics, '{}'::jsonb),
             '{extraction_count}',
             to_jsonb($1)
           ),
           '{validation_count}',
           to_jsonb($2)
         ),
         '{review_count}',
         to_jsonb($3)
       )
       WHERE request_id = $4`,
      [extractionCount, validationCount, reviewCount, requestId]
    );
  } catch (err) {
    console.error('AI Observer: failed to update extraction metrics:', err.message);
  }
}
