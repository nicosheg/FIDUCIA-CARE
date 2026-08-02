// pages/api/ai/correct-scan.js
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function callGroq(rawText) {
  const systemPrompt = `You are an AI assistant for FIDUCIA CARE. Your input is OCR text from an attendance register with two columns: Names and Phone Numbers.

Your job:
1. Split each row into a person's full name and their phone number.
2. If a phone number appears on its own line, attach it to the previous person.
3. Correct OCR mistakes in names.
4. Normalize phone numbers to +234XXXXXXXXXX. Remove all spaces and symbols. Incomplete numbers stay empty.
5. Set confidence 0-100.
6. Return ONLY a JSON array. No other text.

Format:
[
  { "name": "Sis Sandra Isichei", "phone": "+2348039529158", "confidence": 95 }
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
  let content = data.choices[0].message.content.trim();
  content = content.replace(/```json|```/g, '').trim();

  // Extract JSON array
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const arr = JSON.parse(arrayMatch[0]);
    if (Array.isArray(arr)) return arr;
  }

  throw new Error('Could not parse JSON from Groq: ' + content);
}

function localFallback(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const people = [];
  let pendingPhone = null;

  const isPhoneLike = s => s.replace(/\D/g, '').length >= 8;
  const isHeader = s => /^(name|phone|telephone|attendance|date|program|service|total)$/i.test(s);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/[\\\/]/g, ' ').replace(/\s+/g, ' ').trim();
    if (isHeader(line)) continue;

    // If line is only a phone number, store it for next name
    if (isPhoneLike(line) && !/[a-zA-Z]{2,}/.test(line)) {
      pendingPhone = line.replace(/\s/g, '');
      continue;
    }

    // Try to find a phone number at the end of the line
    const phoneMatch = line.match(/(.*?)([0-9+\-\s]{8,})$/);
    let namePart = line;
    let phonePart = null;

    if (phoneMatch) {
      namePart = phoneMatch[1].trim();
      phonePart = phoneMatch[2].replace(/\s/g, '');
    } else if (i + 1 < lines.length && isPhoneLike(lines[i + 1]) && !/[a-zA-Z]{2,}/.test(lines[i + 1])) {
      // No phone on this line, but next line is a phone – use it
      phonePart = lines[i + 1].replace(/\s/g, '');
      i++; // skip next line
    }

    // Accept name if it has at least one letter
    if (namePart.length >= 2 && /[a-zA-Z]/.test(namePart)) {
      const phone = phonePart || pendingPhone || '';
      let normalizedPhone = '';
      if (phone) {
        normalizedPhone = phone.replace(/[\s\-\/\\|]/g, '');
        if (normalizedPhone.startsWith('0')) normalizedPhone = '+234' + normalizedPhone.substring(1);
        if (normalizedPhone.startsWith('234') && !normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
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

  // Attach leftover phone to last person
  if (pendingPhone && people.length > 0) {
    people[people.length - 1].phone = pendingPhone;
    people[people.length - 1].confidence = Math.min(people[people.length - 1].confidence + 5, 100);
  }

  return people;
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
      people = localFallback(rawText);
    }

    // Remove any entries with purely numeric names
    const validPeople = people.filter(p => {
      if (!p.name || p.name.trim().length === 0) return false;
      if (/^[0-9+\-\s]+$/.test(p.name.trim())) return false;
      return true;
    });

    console.log(`AI engine: ${usedGroq ? 'Groq' : 'Local fallback'}`);
    console.log('Corrected:', validPeople);

    return res.status(200).json({ people: validPeople });
  } catch (error) {
    console.error('AI correction error:', error);
    return res.status(500).json({ error: error.message });
  }
}
