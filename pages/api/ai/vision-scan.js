const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';   // Groq vision model
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { image_base64 } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'No image data' });

  const systemPrompt = `You are an AI assistant for FIDUCIA CARE. This is a photo of a church attendance register with two columns: Names and Phone Numbers. Extract each person as a structured JSON array with 'name' and 'phone' fields. Normalize phone numbers to +234XXXXXXXXXX format (remove spaces/symbols). If a name or phone number is unclear, leave it empty rather than guessing. Return ONLY the JSON array, no other text.`;

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
                image_url: {
                  url: `data:image/jpeg;base64,${image_base64}`,
                },
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
    let content = data.choices[0].message.content.trim();
    // Strip markdown fences
    content = content.replace(/```json|```/g, '').trim();
    // Extract JSON array
    const arrayMatch = content.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const people = JSON.parse(arrayMatch[0]);
      if (Array.isArray(people)) {
        return res.status(200).json({ people });
      }
    }
    throw new Error('Invalid JSON from vision model');
  } catch (error) {
    console.error('Vision scan error:', error);
    return res.status(500).json({ error: error.message });
  }
    }
