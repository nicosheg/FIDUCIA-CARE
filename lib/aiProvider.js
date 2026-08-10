// lib/aiProvider.js
import { getModelConfig } from './modelRegistry';
import { logAIUsage } from './aiObserver';
import { reserveBudget, confirmReservation, cancelReservation } from './budgetGuard';
import { v4 as uuidv4 } from 'uuid';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  throw new Error('aiProvider: GROQ_API_KEY environment variable is required');
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL_KEY = process.env.GROQ_VISION_MODEL_KEY || 'groq-qwen3.6-27b';
const MODEL_CONFIG = getModelConfig(DEFAULT_MODEL_KEY);
if (!MODEL_CONFIG) {
  throw new Error(`Unknown AI model: ${DEFAULT_MODEL_KEY}`);
}
const MODEL = MODEL_CONFIG.model;

// UPDATED SYSTEM PROMPT – explicitly forbids reasoning, <think>, explanations, markdown
const SYSTEM_PROMPT = `You are ARIA. Extract every person's name and phone number from this register photo.
Return ONLY a JSON object with a "people" array. Each item has "name" and "phone".
DO NOT include any reasoning, explanations, markdown, or thinking.
If a phone number is unreadable, return null.
Return ONLY valid JSON, with no other text.`;

const REQUEST_TIMEOUT_MS = 45000;
const MAX_RETRY_AFTER_SEC = 60;

function isRetryableStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function callGroq(imageBase64, isRetry, options = {}) {
  const {
    organization_id,
    job_id,
    purpose = 'scan',
    prompt_version = 'v2',
    attempt = 1,
    evaluation = false,
  } = options;

  if (!imageBase64 || typeof imageBase64 !== 'string' || imageBase64.length < 10) {
    throw new Error('Invalid image data');
  }

  let reservationId = null;
  let reservationSettled = false;

  const cancelIfNeeded = async () => {
    if (!reservationId || evaluation || reservationSettled) {
      return;
    }
    try {
      const cancelled = await cancelReservation(reservationId);
      if (cancelled) {
        reservationSettled = true;
        return;
      }
      // not pending → treat as terminal
      reservationSettled = true;
    } catch (cancelErr) {
      console.error(
        `AI Provider: failed to cancel reservation ${reservationId}:`,
        cancelErr.message
      );
      // leave reservationSettled false so reconciliation can detect it
    }
  };

  // ---- Budget reservation (only if guard is enabled) ----
  // The budgetGuard will return a no‑op reservation if the table is missing.
  if (!evaluation) {
    const budget = await reserveBudget(organization_id, purpose, DEFAULT_MODEL_KEY);
    if (!budget.allowed) {
      const err = new Error(`Budget guard: ${budget.reason}`);
      err.status = 429;
      err.retryable = false;
      throw err;
    }
    reservationId = budget.reservationId; // may be null if guard disabled
  }

  const requestId = uuidv4();
  const startTime = Date.now();
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const systemPrompt = isRetry
      ? SYSTEM_PROMPT + ' Focus on accuracy. If unclear, return null.'
      : SYSTEM_PROMPT;

    const payload = {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          { type: 'text', text: 'Output the JSON object now.' }
        ]}
      ],
      temperature: 0,
      max_completion_tokens: MODEL_CONFIG.max_completion_tokens,
    };

    if (MODEL_CONFIG.supports_json_object) {
      payload.response_format = { type: 'json_object' };
    }
    if (MODEL_CONFIG.supports_reasoning_effort) {
      payload.reasoning_effort = 'none';
      payload.include_reasoning = false;
    }

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });

    const latencyMs = Date.now() - startTime;
    const httpStatus = response.status;
    let responseData;
    try {
      responseData = await response.json();
    } catch (jsonErr) {
      throw new Error('Malformed JSON response from AI provider');
    }

    const headers = response.headers;
    const rateLimitRemainingTokens = headers.get('x-ratelimit-remaining-tokens') || null;
    const rateLimitRemainingRequests = headers.get('x-ratelimit-remaining-requests') || null;
    const rateLimitResetTokens = headers.get('x-ratelimit-reset-tokens') || null;
    const rateLimitResetRequests = headers.get('x-ratelimit-reset-requests') || null;
    const retryAfterHeader = headers.get('retry-after');

    if (!response.ok) {
      const rawErrorMsg = responseData.error?.message || `HTTP ${httpStatus}`;
      console.error('AI Provider error (raw):', rawErrorMsg);
      const safeErrorMsg = 'AI service temporarily unavailable';

      await cancelIfNeeded();

      const err = new Error(safeErrorMsg);
      err.status = httpStatus;
      err.retryAfter = retryAfterHeader;
      err.retryable = isRetryableStatus(httpStatus);

      if (!evaluation) {
        await logAIUsage({
          organization_id,
          job_id,
          request_id: requestId,
          model_key: DEFAULT_MODEL_KEY,
          provider: 'groq',
          model: MODEL,
          purpose,
          prompt_version,
          attempt,
          input_tokens: null,
          output_tokens: null,
          latency_ms: latencyMs,
          finish_reason: 'error',
          http_status: httpStatus,
          success: false,
          retry_reason: rawErrorMsg,
          rate_limit_remaining_tokens: rateLimitRemainingTokens,
          rate_limit_remaining_requests: rateLimitRemainingRequests,
          rate_limit_reset_tokens: rateLimitResetTokens,
          rate_limit_reset_requests: rateLimitResetRequests,
          retry_after: retryAfterHeader,
        });
      }
      throw err;
    }

    if (!responseData.choices || !responseData.choices.length || !responseData.choices[0].message) {
      throw new Error('Invalid response structure: missing choices or message');
    }
    const content = responseData.choices[0].message.content;
    if (typeof content !== 'string') {
      throw new Error('Invalid response: message content is not a string');
    }

    const usage = responseData.usage || {};
    const promptTokens = usage.prompt_tokens;
    const completionTokens = usage.completion_tokens;
    const isValidPrompt = typeof promptTokens === 'number' && Number.isFinite(promptTokens) && promptTokens >= 0;
    const isValidCompletion = typeof completionTokens === 'number' && Number.isFinite(completionTokens) && completionTokens >= 0;

    if (!isValidPrompt || !isValidCompletion) {
      console.error('AI Provider: missing or invalid usage tokens', { promptTokens, completionTokens });
      await cancelIfNeeded();
      const err = new Error('AI response accounting error');
      err.status = 500;
      err.retryable = false;
      throw err;
    }

    const actualCost =
      (promptTokens / 1000) * MODEL_CONFIG.input_cost_per_1k +
      (completionTokens / 1000) * MODEL_CONFIG.output_cost_per_1k;

    // Validate actualCost
    if (
      typeof actualCost !== 'number' ||
      !Number.isFinite(actualCost) ||
      actualCost < 0
    ) {
      console.error(
        'AI Provider: calculated actual cost is invalid',
        { actualCost }
      );
      await cancelIfNeeded();
      const err = new Error('AI response accounting error');
      err.status = 500;
      err.retryable = false;
      throw err;
    }

    // Confirm reservation only if we have one (guard enabled)
    if (reservationId && !evaluation) {
      const confirmed = await confirmReservation(reservationId, actualCost);
      if (!confirmed) {
        console.error(
          `AI Provider: reservation ${reservationId} could not be confirmed after successful AI call`
        );
        // Do not set reservationSettled; we throw and finally cancels
        const err = new Error('AI accounting confirmation failed');
        err.status = 500;
        err.retryable = false;
        throw err;
      }
      reservationSettled = true;
    }

    if (!evaluation) {
      await logAIUsage({
        organization_id,
        job_id,
        request_id: requestId,
        model_key: DEFAULT_MODEL_KEY,
        provider: 'groq',
        model: MODEL,
        purpose,
        prompt_version,
        attempt,
        input_tokens: promptTokens,
        output_tokens: completionTokens,
        latency_ms: latencyMs,
        finish_reason: responseData.choices[0].finish_reason,
        http_status: httpStatus,
        success: true,
        retry_reason: null,
        rate_limit_remaining_tokens: rateLimitRemainingTokens,
        rate_limit_remaining_requests: rateLimitRemainingRequests,
        rate_limit_reset_tokens: rateLimitResetTokens,
        rate_limit_reset_requests: rateLimitResetRequests,
        retry_after: retryAfterHeader,
      });
    }

    return {
      data: responseData,
      provider: 'groq',
      model: MODEL,
      modelKey: DEFAULT_MODEL_KEY,
      requestId,
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
      rateLimit: {
        remainingTokens: rateLimitRemainingTokens,
        remainingRequests: rateLimitRemainingRequests,
        resetTokens: rateLimitResetTokens,
        resetRequests: rateLimitResetRequests,
      },
      reservationId,
      retryAfter: retryAfterHeader,
    };

  } catch (err) {
    throw err;
  } finally {
    clearTimeout(timeoutId);
    await cancelIfNeeded();
  }
}

export async function callVisionWithRetry(imageBase64, onRetry = null, options = {}) {
  let attempt = 0;
  const maxAttempts = 3;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const result = await callGroq(imageBase64, attempt > 1, { ...options, attempt });
      return { ...result, attempt };
    } catch (err) {
      const retryable = err.retryable !== undefined ? err.retryable : false;
      if (retryable && attempt < maxAttempts) {
        let delay;
        const retryAfterHeader = err.retryAfter;
        if (retryAfterHeader !== null && retryAfterHeader !== undefined) {
          const parsed = Number(retryAfterHeader);
          if (Number.isFinite(parsed) && parsed >= 0) {
            delay = Math.min(parsed, MAX_RETRY_AFTER_SEC) * 1000;
          }
        }
        if (delay === undefined || delay === null) {
          delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
        }
        if (onRetry) onRetry(attempt, delay);
        await new Promise(resolve => setTimeout(resolve, delay));
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error('All retries failed.');
                                       }
