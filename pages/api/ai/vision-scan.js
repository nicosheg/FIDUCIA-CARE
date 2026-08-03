const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
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
    const rawContent = data.choices[0].message.content;
    console.log('Vision raw response:', rawContent);

    // Try to extract a JSON array from the response
    let people = [];
    const cleaned = rawContent.replace(/```json|```/g, '').trim();
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (Array.isArray(parsed)) people = parsed;
      } catch (e) {
        console.error('Failed to parse JSON array from vision response');
      }
    }

    // If we still have nothing, try parsing the entire cleaned text as JSON
    if (!people.length) {
      try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) people = parsed;
        else if (parsed.people) people = parsed.people;
      } catch (e) {}
    }

    console.log('Vision extracted people:', people.length);
    return res.status(200).json({ people });
  } catch (error) {
    console.error('Vision scan error:', error);
    // Return empty so the fallback takes over gracefully
    return res.status(200).json({ people: [] });
  }
        }
