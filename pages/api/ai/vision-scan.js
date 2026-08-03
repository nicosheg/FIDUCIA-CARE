const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { image_base64 } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'No image data' });

  const systemPrompt = `You are an AI assistant for FIDUCIA CARE. This is a photo of a church attendance register with two columns: Names and Phone Numbers. Extract each person as a structured JSON array with 'name' and 'phone' fields. Normalize phone numbers to +234XXXXXXXXXX format (remove spaces/symbols). If a name or phone number is unclear, leave it empty rather than guessing. **Do not include any reasoning or explanation.** Return ONLY the JSON array, no other text.`;

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${image_base64}` },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Groq vision API error');
    }

    const data = await response.json();
    let rawContent = data.choices[0].message.content;
    console.log('Vision raw response:', rawContent);

    // 1. Try to find JSON after </think> tag
    let jsonStr = '';
    if (rawContent.includes('</think>')) {
      jsonStr = rawContent.split('</think>')[1].trim();
    } else {
      jsonStr = rawContent;
    }

    // 2. Extract JSON array
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    let people = [];
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed)) people = parsed;
      } catch (e) {
        console.error('Failed to parse JSON array from extracted text');
      }
    }

    // 3. Fallback: parse the reasoning block for names and phone numbers
    if (!people.length) {
      console.log('Attempting to parse reasoning block for name/phone pairs');
      const lines = rawContent.split('\n');
      const namePhoneRegex = /(?:\*|\d+\.)\s*\*{0,2}Name:\*{0,2}\s*(.+?)(?:\s*Phone:\s*(.+?))?\s*$/i;
      const fallbackPeople = [];
      let currentName = null;
      let currentPhone = null;

      for (const line of lines) {
        const match = line.match(namePhoneRegex);
        if (match) {
          // If we have a previous name and phone, push it
          if (currentName) {
            fallbackPeople.push({ name: currentName.trim(), phone: currentPhone || '' });
          }
          currentName = match[1].trim();
          currentPhone = match[2] ? match[2].replace(/[^0-9+]/g, '') : null;
        } else {
          // Check for loose phone number (e.g., "Phone: 080...")
          const phoneOnly = line.match(/Phone:\s*([0-9+\s]+)/i);
          if (phoneOnly && currentName) {
            currentPhone = phoneOnly[1].replace(/\s/g, '');
          }
        }
      }
      // Push last entry
      if (currentName) {
        fallbackPeople.push({ name: currentName.trim(), phone: currentPhone || '' });
      }

      if (fallbackPeople.length) {
        people = fallbackPeople;
      }
    }

    // Normalize phone numbers
    people = people.map(p => {
      let phone = p.phone || '';
      if (phone.startsWith('0')) phone = '+234' + phone.substring(1);
      if (phone.startsWith('234') && !phone.startsWith('+')) phone = '+' + phone;
      return { name: p.name, phone, confidence: 85 }; // default confidence for vision
    });

    console.log('Vision extracted people:', people.length);
    return res.status(200).json({ people });
  } catch (error) {
    console.error('Vision scan error:', error);
    // Return empty so fallback takes over
    return res.status(200).json({ people: [] });
  }
            }
