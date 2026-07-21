// Groq LLM integration with local fallback – document understanding mode
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function callGroq(rawText) {
  const systemPrompt = `You are an AI document understanding assistant for FIDUCIA CARE, a church management platform in Nigeria.
Your input is the raw, messy OCR text from an attendance register. The register has two columns: Names and Phone Numbers.

Your job is to:
1. **Detect the table rows.** Even if the OCR text is jumbled, group lines that belong to the same person.
2. **Split each row into Name and Phone Number.** Use Nigerian phone number patterns (starting with 080, 081, 070, 090, etc.) to identify the phone number.
3. **Correct OCR mistakes** in names (e.g., "Sis Sandro Isucbel" → "Sis Sandra Isichei"). Use common sense, Nigerian name knowledge, and the fact that many names start with "Sis", "Bro", "Pastor", "Mrs", "Mr", "Evang", etc.
4. **Normalize phone numbers** to the format +234XXXXXXXXXX. Remove all spaces and symbols. If a phone number is incomplete, set it to empty.
5. **Output confidence** between 0 and 100 for each person. High confidence (90+) for names that are clear and phone numbers that look correct. Medium (80-89) for minor corrections. Low (70-79) for heavy corrections.
6. **Return ONLY a JSON array**, no other text.

Format:
[
  {
    "name": "Sis Sandra Isichei",
    "phone": "+2348039529158",
    "confidence": 95
  },
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

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Groq API error');
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('Groq returned empty response');

  const clean = content.replace(/```json|```/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) throw new Error('Response is not an array');
  } catch (e) {
    console.error('Failed to parse Groq response:', clean);
    throw new Error('Groq response was not valid JSON');
  }
  return parsed;
}

function localFallback(rawText) {
  // ... (keep the same robust local fallback from before)
  // I'll include the full code below for completeness.
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { rawText } = req.body;
  if (!rawText) return res.status(400).json({ error: 'No text provided' });

  try {
    let people = [];
    let usedGroq = false;

    if (GROQ_API_KEY) {
      try {
        people = await callGroq(rawText);
        usedGroq = true;
      } catch (groqErr) {
        console.error('Groq failed, falling back to local:', groqErr.message);
        people = localFallback(rawText);
      }
    } else {
      people = localFallback(rawText);
    }

    // Clean bare +234 and short numbers
    const cleanedPeople = people.filter(p => p.name).map(p => {
      let phone = p.phone || '';
      if (phone === '+234' || phone.replace(/\D/g, '').length < 10) phone = '';
      return { ...p, phone };
    });

    console.log('Raw OCR text:', rawText);
    console.log('Corrected people (used Groq:', usedGroq, '):', cleanedPeople);

    return res.status(200).json({ people: cleanedPeople });
  } catch (error) {
    console.error('AI correction error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Include the local fallback function here (same as before)
function localFallback(rawText) {
  const lines = rawText.split('\n').map(line => line.trim()).filter(Boolean);
  const people = [];
  let pendingPhone = null;

  const isPhoneLike = (str) => {
    const digits = str.replace(/\D/g, '');
    return digits.length >= 8;
  };

  const isHeader = (str) =>
    /^(name|phone|telephone|attendance|date|program|service|total)$/i.test(str);

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
      let normalizedPhone = '';
      if (phone) {
        normalizedPhone = phone.replace(/[\s\-\/\\|]/g, '');
        if (normalizedPhone.startsWith('0')) normalizedPhone = '+234' + normalizedPhone.substring(1);
        if (normalizedPhone.startsWith('234') && !normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
      }
      people.push({
        name: namePart,
        phone: normalizedPhone,
        confidence: namePart.length > 5 ? 85 : 80,
      });
      pendingPhone = null;
    }
  }

  if (pendingPhone && people.length > 0) {
    people[people.length - 1].phone = pendingPhone;
    people[people.length - 1].confidence = Math.min(people[people.length - 1].confidence + 5, 100);
  }

  // Remove duplicates
  const unique = [];
  const seen = new Set();
  for (const p of people) {
    const key = `${p.name}|${p.phone}`;
    if (!seen.has(key)) {
      unique.push(p);
      seen.add(key);
    }
  }
  return unique;
      }
