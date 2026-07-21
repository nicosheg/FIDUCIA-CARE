// Groq LLM integration with local fallback
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function callGroq(rawText) {
  const systemPrompt = `You are an AI assistant for FIDUCIA CARE, a church management platform.
Your task is to take raw OCR output from an attendance register photo and return a clean, structured JSON array of people.

Rules:
- The register contains handwritten names and phone numbers, sometimes on the same line, sometimes on separate lines.
- Extract every person mentioned. If a phone number appears on its own line, attach it to the previous name.
- Normalize phone numbers to Nigerian format: if it starts with '0', prepend '+234'. If it starts with '234', add '+'. Remove slashes, spaces, and other non-digit characters.
- Correct obvious OCR mistakes in names (e.g., "BL ERELL" -> likely "Blessing Emelie"). Use common sense and context.
- **Output the full name as a single string in the "name" field.** Do not split into first/last.
- For each person, provide a confidence score between 0 and 100 indicating how sure you are about the corrected name.
- Return ONLY a JSON array, no other text.

Format:
[
  {
    "name": "Sis Blessing Faith",
    "phone": "+234...",
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
      model: 'llama-3.1-8b-instant',   // current Groq model
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
  const content = data.choices[0].message.content.trim();
  // Remove markdown fences if present
  const clean = content.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

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
    // Clean up slashes / backslashes that break words
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

    // More lenient: require only one letter, at least 2 characters
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
        confidence: namePart.length > 5 ? 90 : 80,
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { rawText } = req.body;
  if (!rawText) return res.status(400).json({ error: 'No text provided' });

  try {
    let people = [];
    if (GROQ_API_KEY) {
      try {
        people = await callGroq(rawText);
      } catch (groqErr) {
        console.error('Groq failed, falling back to local:', groqErr.message);
        people = localFallback(rawText);
      }
    } else {
      people = localFallback(rawText);
    }

    // Ensure no null/empty names
    const validPeople = people.filter(p => p.name && p.name.trim().length > 0);

    // Clean bare country codes and very short phone numbers
    const cleanedPeople = validPeople.map(p => {
      let phone = p.phone;
      if (phone === '+234' || phone.length < 10) phone = ''; // remove invalid
      return { ...p, phone };
    });

    console.log('Raw OCR text:', rawText);
    console.log('Corrected people:', cleanedPeople);

    return res.status(200).json({ people: cleanedPeople });
  } catch (error) {
    console.error('AI correction error:', error);
    return res.status(500).json({ error: error.message });
  }
    }
