// lib/aiProvider.js – ARIA Vision Router with multiple providers

import crypto from 'crypto';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Gemini (optional)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-vision:generateContent?key=' + GEMINI_API_KEY;

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 2000; // ms
const REQUEST_TIMEOUT = 45000; // 45 seconds

// ---- Helpers ----
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ---- Friendly error mapping ----
function friendlyErrorMessage(rawError) {
  const msg = rawError?.message || String(rawError);
  if (msg.includes('Rate limit') || msg.includes('rate limit') || msg.includes('TPM')) {
    return 'ARIA is very busy right now. Please wait a moment.';
  }
  if (msg.includes('timeout') || msg.includes('timed out')) {
    return 'ARIA took longer than expected. Please try again.';
  }
  if (msg.includes('model') || msg.includes('invalid') || msg.includes('API')) {
    return 'ARIA is having trouble reading the image. Please ensure the register is clear and well‑lit.';
  }
  return 'ARIA couldn’t complete the scan. Please try again.';
}

// ---- Fetch with timeout ----
async function fetchWithTimeout(url, options, timeout) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') throw new Error('Request timeout');
    throw err;
  }
}

// ---- Providers ----
async function callGroq(imageBase64, isRetry = false) {
  if (!GROQ_API_KEY) throw new Error('Groq API key missing');
  const systemPrompt = isRetry
    ? `You are ARIA. Extract every person's name and phone number from this register photo. Return ONLY a raw JSON array of { "name": "...", "phone": "..." }. NO markdown, NO numbering, NO bullet points, NO commentary.`
    : `You are ARIA. Extract every person's name and phone number from this church attendance register photo. Return ONLY a JSON array of { "name": "...", "phone": "..." }. No other text.`;

  const response = await fetchWithTimeout(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_API_KEY}` },
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
    }),
  }, REQUEST_TIMEOUT);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Groq API error');
  }
  return response.json();
}

async function callGemini(imageBase64, isRetry = false) {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key missing');
  const prompt = isRetry
    ? 'Extract every person\'s name and phone number from this register photo. Return ONLY a raw JSON array of { "name": "...", "phone": "..." }. NO markdown, NO numbering, NO bullet points, NO commentary.'
    : 'Extract every person\'s name and phone number from this church attendance register photo. Return ONLY a JSON array of { "name": "...", "phone": "..." }. No other text.';

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
      ]
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 2000 },
  };

  const response = await fetchWithTimeout(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, REQUEST_TIMEOUT);

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gemini API error');
  }
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return { choices: [{ message: { content: text } }] };
}

// ---- Router ----
export async function callVisionWithRetry(imageBase64, onRetry = null) {
  const providers = [];
  if (GROQ_API_KEY) providers.push({ name: 'Groq', fn: callGroq });
  if (GEMINI_API_KEY) providers.push({ name: 'Gemini', fn: callGemini });
  if (providers.length === 0) throw new Error('No AI providers configured');

  let lastError = null;
  let attempt = 0;

  for (let pIndex = 0; pIndex < providers.length; pIndex++) {
    const provider = providers[pIndex];
    attempt = 0;
    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        const data = await provider.fn(imageBase64, attempt > 1);
        return { data, provider: provider.name, attempt };
      } catch (err) {
        const msg = err.message || '';
        const isRateLimit = msg.includes('Rate limit') || msg.includes('rate limit') || msg.includes('TPM') || msg.includes('429');
        const isTimeout = msg.includes('timeout') || msg.includes('timed out');

        if ((isRateLimit || isTimeout) && attempt < MAX_RETRIES) {
          const delay = INITIAL_BACKOFF * attempt;
          console.log(`Provider ${provider.name} attempt ${attempt} failed (${msg}), retrying in ${delay}ms`);
          if (onRetry) onRetry(provider.name, attempt, delay);
          await sleep(delay);
          lastError = err;
          continue;
        }
        // Non‑retryable or final attempt
        console.error(`Provider ${provider.name} failed after ${attempt} attempts:`, err.message);
        lastError = err;
        break; // try next provider
      }
    }
    // If we successfully got data, break out of provider loop
    if (lastError === null) break;
  }

  // If all providers failed, throw the last error (friendly mapped)
  throw new Error(friendlyErrorMessage(lastError));
}
