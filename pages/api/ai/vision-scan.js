const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { image_base64 } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'No image data' });

  const systemPrompt = `You are an AI assistant for FIDUCIA CARE. This is a photo of a church attendance register with two columns: Names and Phone Numbers. Extract each person as a structured JSON array with 'name' and 'phone' fields. Normalize phone numbers to +234XXXXXXXXXX format (remove spaces/symbols). If a name or phone number is unclear, leave it empty rather than guessing. **Do not include any reasoning or explanation.** Return ONLY the JSON array, no other text.`;

  // Helper function to perform one API call
  const callVision = async () => {
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
        max_tokens: 4000,                  // plenty of room for full JSON
        response_format: { type: 'json_object' },   // skip reasoning, direct JSON
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Groq vision API error');
    }

    return await response.json();
  };

  // Parse the response into people array
  const parseResponse = (rawContent) => {
    let people = [];
    // If the model still outputs a reasoning block (unlikely with json_mode), extract JSON after </think>
    let jsonStr = rawContent;
    if (rawContent.includes('</think>')) {
      jsonStr = rawContent.split('</think>')[1].trim();
    }

    // Remove markdown fences if any
    jsonStr = jsonStr.replace(/```json|```/g, '').trim();

    // Try to parse as JSON object directly (json_mode might return the array directly or wrapped)
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        people = parsed;
      } else if (parsed && typeof parsed === 'object') {
        // Sometimes the model returns { "people": [...] } etc.
        const arr = Object.values(parsed).find(Array.isArray);
        if (arr) people = arr;
      }
    } catch (e) {
      // Fallback: try to extract array from the string
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          const parsed = JSON.parse(arrayMatch[0]);
          if (Array.isArray(parsed)) people = parsed;
        } catch {}
      }
    }

    return people;
  };

  // Main execution with retry
  let people = [];
  try {
    // First attempt
    let data;
    try {
      data = await callVision();
    } catch (err) {
      console.error('Vision call 1 failed:', err.message);
    }

    if (data) {
      const rawContent = data.choices[0].message.content;
      console.log('Vision raw response:', rawContent);
      people = parseResponse(rawContent);
    }

    // If we got no people, retry once
    if (!people || people.length === 0) {
      console.log('Vision first attempt yielded no people, retrying...');
      try {
        const retryData = await callVision();
        const rawContent = retryData.choices[0].message.content;
        console.log('Vision retry raw response:', rawContent);
        people = parseResponse(rawContent);
      } catch (err) {
        console.error('Vision retry failed:', err.message);
      }
    }

    // Normalize phone numbers
    people = people.map(p => ({
      name: p.name || '',
      phone: normalizePhone(p.phone || ''),
      confidence: 85,        // default high confidence for vision
    }));

    console.log('Vision extracted people:', people.length);
    return res.status(200).json({ people });
  } catch (error) {
    console.error('Vision scan error:', error);
    // Return empty so fallback takes over
    return res.status(200).json({ people: [] });
  }
}

function normalizePhone(phone) {
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('0')) cleaned = '+234' + cleaned.substring(1);
  if (cleaned.startsWith('234') && !cleaned.startsWith('+')) cleaned = '+' + cleaned;
  return cleaned;
          }
