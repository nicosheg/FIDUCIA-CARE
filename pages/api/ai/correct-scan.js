import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { rawText } = req.body;
  if (!rawText) return res.status(400).json({ error: 'No text provided' });

  try {
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

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawText }
      ],
      temperature: 0.2,
      max_tokens: 2000,
    });

    const aiResponse = completion.choices[0].message.content.trim();
    const cleanJson = aiResponse.replace(/```json|```/g, '').trim();
    const correctedPeople = JSON.parse(cleanJson);
    return res.status(200).json({ people: correctedPeople });
  } catch (error) {
    console.error('AI correction error:', error);
    return res.status(500).json({ error: error.message });
  }
      }
