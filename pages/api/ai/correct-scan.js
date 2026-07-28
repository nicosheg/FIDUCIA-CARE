// Enhanced AI correction with Nigerian phone validation
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function callGroq(rawText) {
  const systemPrompt = `You are an AI assistant for FIDUCIA CARE, a church management platform in Nigeria.
Your input is the raw OCR text from an attendance register. The register has two columns: Names and Phone Numbers.

Your job:
1. Group lines that belong to the same person (name + phone).
2. Correct OCR mistakes in names (e.g., "BL ERELL" → "Blessing Emelie"). Use common Nigerian name patterns.
3. Normalize phone numbers to +234XXXXXXXXXX format. Remove spaces, slashes, and symbols. If a phone number is incomplete, set it to empty.
4. Output confidence between 0 and 100 for each person.
5. Return ONLY a JSON array.

Format:
[
  { "name": "Sis Sandra Isichei", "phone": "+2348039529158", "confidence": 95 },
  ...
]`;

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawText },
      ],
      temperature: 0.2,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  const content = data.choices[0].message.content.trim();
  const clean = content.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

function localFallback(rawText) {
  // (keeping the same robust fallback from earlier)
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const people = [];
  let pendingPhone = null;

  const isPhoneLike = s => s.replace(/\D/g, '').length >= 8;
  const isHeader = s => /^(name|phone|telephone|attendance|date|program|service|total)$/i.test(s);

  for (let line of lines) {
    line = line.replace(/[\\\/]/g, ' ').replace(/\s+/g, ' ').trim();
    if (isHeader(line)) continue;
    if (isPhoneLike(line) && !/[a-zA-Z]{2,}/.test(line)) {
      pendingPhone = line.replace(/\s/g, '');
      continue;
    }
    const phoneMatch = line.match(/(.*?)([0-9+\-\s]{8,})$/);
    let namePart = line;
    let phonePart = null;
    if (phoneMatch) {
      namePart = phoneMatch[1].trim();
      phonePart = phoneMatch[2].replace(/\s/g, '');
    }
    if (namePart.length >= 2 && /[a-zA-Z]/.test(namePart)) {
      const phone = phonePart || pendingPhone || '';
      let normalized = '';
      if (phone) {
        normalized = phone.replace(/[\s\-\/\\|]/g, '');
        if (normalized.startsWith('0')) normalized = '+234' + normalized.substring(1);
        if (normalized.startsWith('234') && !normalized.startsWith('+')) normalized = '+' + normalized;
      }
      people.push({
        name: namePart,
        phone: normalized,
        confidence: namePart.length > 5 ? 85 : 80,
      });
      pendingPhone = null;
    }
  }
  if (pendingPhone && people.length > 0) {
    people[people.length - 1].phone = pendingPhone;
    people[people.length - 1].confidence = Math.min(people[people.length - 1].confidence + 5, 100);
  }
  // remove duplicates
  const unique = [];
  const seen = new Set();
  for (const p of people) {
    const key = `${p.name}|${p.phone}`;
    if (!seen.has(key)) { unique.push(p); seen.add(key); }
  }
  return unique;
}

// Nigerian phone validation
function isValidNigerianPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  // must start with 0 or +234, 11 digits for local, or 13 with +234
  if (digits.length === 11 && digits.startsWith('0')) return true;
  if (digits.length === 13 && digits.startsWith('234')) return true;
  if (phone.startsWith('+234') && digits.length === 13) return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { rawText } = req.body;
  if (!rawText) return res.status(400).json({ error: 'No text provided' });

  try {
    let people = [];
    if (GROQ_API_KEY) {
      try { people = await callGroq(rawText); }
      catch (e) { console.error('Groq failed, local fallback:', e.message); people = localFallback(rawText); }
    } else {
      people = localFallback(rawText);
    }

    // Post-process: validate phones and boost confidence
    const cleaned = people
      .filter(p => p.name && p.name.trim().length > 0)
      .map(p => {
        let phone = p.phone || '';
        // remove bare +234
        if (phone === '+234') phone = '';
        // if phone is present but invalid, set to empty and reduce confidence
        if (phone && !isValidNigerianPhone(phone)) {
          phone = '';
          p.confidence = Math.min(p.confidence, 75);
        }
        if (phone && isValidNigerianPhone(phone)) {
          p.confidence = Math.min(p.confidence + 10, 100);
        }
        return { name: p.name.trim(), phone, confidence: p.confidence };
      });

    // Remove duplicates again after cleaning
    const unique = [];
    const seen = new Set();
    for (const p of cleaned) {
      const key = `${p.name}|${p.phone}`;
      if (!seen.has(key)) { unique.push(p); seen.add(key); }
    }

    console.log('Raw OCR:', rawText);
    console.log('Corrected:', unique);

    return res.status(200).json({ people: unique });
  } catch (error) {
    console.error('AI correction error:', error);
    return res.status(500).json({ error: error.message });
  }
    }
