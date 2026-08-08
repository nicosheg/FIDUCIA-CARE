// lib/aiProvider.js – Central AI Gateway with retry, timeout, and friendly errors

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 2000; // ms
const REQUEST_TIMEOUT = 30000; // 30 seconds

// -------- Friendly error mapping --------
function friendlyErrorMessage(rawError) {
  const msg = rawError?.message || String(rawError);
  if (msg.includes('Rate limit') || msg.includes('rate limit') || msg.includes('TPM')) {
    return 'ARIA is very busy right now. Please wait a moment and try again.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'ARIA took a little longer than expected. Please try again.';
  }
  if (msg.includes('model') || msg.includes('invalid')) {
    return 'ARIA is having trouble reading the image. Please ensure the register is clear and well‑lit.';
  }
  return 'ARIA couldn’t complete the scan. Please try again.';
}

// -------- Internal: fetch with timeout --------
async function fetchWithTimeout(url, options, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

// -------- Single vision call with retry and backoff --------
export async function callVisionWithRetry(imageBase64, onRetry = null) {
  let lastError = null;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const systemPrompt = attempt === 1
        ? `You are ARIA. Extract every person's name and phone number from this church attendance register photo. Return ONLY a JSON array of { "name": "...", "phone": "..." }. No other text.`
        : `You are ARIA. Extract every person's name and phone number from this register photo. Return ONLY a raw JSON array of { "name": "...", "phone": "..." }. NO markdown, NO numbering, NO bullet points, NO commentary.`;

      const response = await fetchWithTimeout(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_VISION_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: [
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
              { type: 'text', text: 'Output the JSON array now.' }
            ]}
          ],
          temperature: 0,
          max_tokens: 2000,
          stream: false,
        }),
      }, REQUEST_TIMEOUT);

      if (response.ok) {
        const data = await response.json();
        return data;
      }

      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || 'Unknown error';
      const isRateLimit = response.status === 429 || msg.includes('Please try again') || msg.includes('Rate limit');

      if (isRateLimit && attempt < MAX_RETRIES) {
        const delay = INITIAL_BACKOFF * attempt; // exponential: 2s, 4s, 6s
        console.log(`Rate limit hit (attempt ${attempt}), waiting ${delay}ms...`);
        if (onRetry) onRetry(attempt, delay);
        await new Promise(r => setTimeout(r, delay));
        lastError = { message: msg, isRateLimit: true };
        continue;
      }

      // Non‑rate‑limit or final attempt failed
      throw new Error(msg);
    } catch (error) {
      if (error.message === 'Request timeout' || error.message.includes('timeout')) {
        if (attempt < MAX_RETRIES) {
          const delay = INITIAL_BACKOFF * attempt;
          console.log(`Timeout (attempt ${attempt}), retrying in ${delay}ms...`);
          if (onRetry) onRetry(attempt, delay);
          await new Promise(r => setTimeout(r, delay));
          lastError = error;
          continue;
        }
      }
      throw error;
    }
  }

  // All retries exhausted
  throw lastError || new Error('All retries failed.');
}

// -------- Expose a friendly error to store --------
export function getFriendlyError(rawError) {
  return friendlyErrorMessage(rawError);
}
