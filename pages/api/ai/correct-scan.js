// Fully working Groq integration with local fallback
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function callGroq(rawText) {
  const systemPrompt = `You are an AI assistant for FIDUCIA CARE, a church management platform in Nigeria.
Your input is the raw, messy OCR text from an attendance register. The register has two columns: Names and Phone Numbers.

Your job is to:
1. Detect the table rows.
2. Split each row into Name and Phone Number. Use Nigerian phone number patterns.
3. Correct OCR mistakes in names. Use common sense, Nigerian name knowledge.
4. Normalize phone numbers to the format +234XXXXXXXXXX. Remove all spaces and symbols. If a phone number is incomplete, set it to empty.
5. Output confidence between 0 and 100 for each person.
6. Return ONLY a JSON array.

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

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Groq API error');
  }

  const data = await response.json();
  const content = data.choices[0].message.content.trim();
  // Remove markdown fences if present
  const clean = content.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

function localFallback(rawText) {
  // (same as before, but enhanced with multi‑line phone detection)
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const people = [];
  let pendingPhone = null;

  const isPhoneLike = s => s.replace(/\D/g, '').length >= 8;
  const isHeader = s => /^(name|phone|telephone|attendance|date|program|service|total)$/i.test(s);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/[\\\/]/g, ' ').replace(/\s+/g, ' ').trim();
    if (isHeader(line)) continue;

    // Check if this line is just a phone number
    if (isPhoneLike(line) && !/[a-zA-Z]{2,}/.test(line)) {
      pendingPhone = line.replace(/\s/g, '');
      continue;
    }

    // Try to separate a trailing phone number
    const phoneMatch = line.match(/(.*?)([0-9+\-\s]{8,})$/);
    let namePart = line;
    let phonePart = null;

    if (phoneMatch) {
      namePart = phoneMatch[1].trim();
      phonePart = phoneMatch[2].replace(/\s/g, '');
    } else {
      // No phone on this line – check the NEXT line for a phone
      if (i + 1 < lines.length && isPhoneLike(lines[i + 1]) && !/[a-zA-Z]{2,}/.test(lines[i + 1])) {
        phonePart = lines[i + 1].replace(/\s/g, '');
        i++; // skip next line
      }
    }

    if (namePart.length >= 2 && /[a-zA-Z]/.test(namePart)) {
      const phone = phonePart || pendingPhone || '';
      let normalizedPhone = '';
      if (phone) {
        normalizedPhone = phone.replace(/[\s\-\/\\|]/g, '');
        if (normalizedPhone.startsWith('0')) normalizedPhone = '+234' + normalizedPhone.substring(1);
        if (normalizedPhone.startsWith('234') && !normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
        // Validate length
        if (normalizedPhone.length < 10) normalizedPhone = '';
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
      } catch (err) {
        console.error('Groq failed, falling back to local:', err.message);
        people = localFallback(rawText);
      }
    } else {
      console.log('No GROQ_API_KEY, using local fallback.');
      people = localFallback(rawText);
    }

    // Clean and filter
    const validPeople = people
      .filter(p => p.name && p.name.trim().length > 0)
      .map(p => ({
        name: p.name.trim(),
        phone: p.phone || '',
        confidence: p.confidence || 70,
      }));

    // Flag entries with uncertain phones
    const flagged = validPeople.map(p => {
      if (p.phone && p.phone.length < 10) {
        p.phone = ''; // remove incomplete phones
        p.phone_unclear = true;   // flag for frontend
      }
      return p;
    });

    console.log(`AI engine: ${usedGroq ? 'Groq' : 'Local fallback'}`);
    console.log('Raw OCR:', rawText);
    console.log('Corrected:', flagged);

    return res.status(200).json({ people: flagged });
  } catch (error) {
    console.error('AI correction error:', error);
    return res.status(500).json({ error: error.message });
  }
        }
