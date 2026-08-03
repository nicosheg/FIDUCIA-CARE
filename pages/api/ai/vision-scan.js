import pool from '../../../lib/db';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { image_base64, church_id, program_name } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'No image data' });

  const orgId = church_id || 'demo-org';
  const programName = program_name || 'GIBEON';

  const systemPrompt = `You are an AI assistant for FIDUCIA CARE. This is a photo of a church attendance register with two columns: Names and Phone Numbers. Extract each person as a structured JSON array with 'name' and 'phone' fields. Normalize phone numbers to +234XXXXXXXXXX format (remove spaces/symbols). If a name or phone number is unclear, leave it empty rather than guessing. **Do not include any reasoning or explanation.** Return ONLY the JSON array, no other text.`;

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
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Groq vision API error');
    }

    return await response.json();
  };

  const parseResponse = (rawContent) => {
    let people = [];
    let jsonStr = rawContent;
    if (rawContent.includes('</think>')) {
      jsonStr = rawContent.split('</think>')[1].trim();
    }
    jsonStr = jsonStr.replace(/```json|```/g, '').trim();

    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        people = parsed;
      } else if (parsed && typeof parsed === 'object') {
        const arr = Object.values(parsed).find(Array.isArray);
        if (arr) people = arr;
      }
    } catch (e) {
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

  const normalizePhone = (phone) => {
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('0')) cleaned = '+234' + cleaned.substring(1);
    if (cleaned.startsWith('234') && !cleaned.startsWith('+')) cleaned = '+' + cleaned;
    return cleaned;
  };

  // --- Main execution with retry ---
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

    // Retry once if empty
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

    // Normalize and filter
    people = people.filter(p => p.name && p.name.trim().length > 0 && !/^[0-9+\-\s]+$/.test(p.name.trim()))
      .map(p => ({
        name: p.name.trim(),
        phone: normalizePhone(p.phone || ''),
        confidence: 85,
      }));

    console.log('Vision extracted people:', people.length);

    // If no people, return empty with failure status so frontend falls back
    if (people.length === 0) {
      return res.status(200).json({ status: 'failed', error: 'No people extracted' });
    }

    // --- Insert into database (same logic as scan-base64) ---
    const client = await pool.connect();
    const savedPeople = [];
    let newMembersCount = 0;

    for (const person of people) {
      const fullName = person.name;
      const phone = person.phone || '';

      try {
        const insertRes = await client.query(
          `INSERT INTO people (organization_id, first_name, last_name, phone, type, status, confidence)
           VALUES ($1, $2, '', $3, 'visitor', 'active', $4)
           RETURNING id`,
          [orgId, fullName, phone, person.confidence || 85]
        );
        const memberId = insertRes.rows[0].id;
        savedPeople.push(memberId);
        newMembersCount++;
        console.log(`Inserted ${fullName} with id ${memberId}`);
      } catch (insertErr) {
        console.error(`Insert error for ${fullName}:`, insertErr.message);
        if (phone) {
          const existing = await client.query(
            `SELECT id FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
            [orgId, phone]
          );
          if (existing.rows.length > 0) {
            savedPeople.push(existing.rows[0].id);
            await client.query(`UPDATE people SET first_name = $1, confidence = $2 WHERE id = $3`,
              [fullName, person.confidence || 85, existing.rows[0].id]);
          }
        }
      }
    }

    // Record attendance
    const today = new Date().toISOString().slice(0, 10);
    let sessionId;
    let sessionRes = await client.query(
      `SELECT id FROM sessions WHERE church_id = $1 AND name = $2 AND created_at::date = $3`,
      [orgId, programName, today]
    );
    if (sessionRes.rows.length === 0) {
      const newSession = await client.query(
        `INSERT INTO sessions (church_id, name, status) VALUES ($1, $2, 'active') RETURNING id`,
        [orgId, programName]
      );
      sessionId = newSession.rows[0].id;
      await client.query(`INSERT INTO session_sections (session_id, name) VALUES ($1, 'All')`, [sessionId]);
    } else {
      sessionId = sessionRes.rows[0].id;
    }
    const sectionRes = await client.query(
      `SELECT id FROM session_sections WHERE session_id = $1 AND name = 'All'`,
      [sessionId]
    );
    const sectionId = sectionRes.rows[0].id;

    for (const personId of savedPeople) {
      await client.query(
        `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (member_id, attendance_date) DO UPDATE SET present = true`,
        [personId, today, sectionId]
      );
      await client.query(
        `INSERT INTO timeline_events (person_id, organization_id, event_type, description, metadata)
         VALUES ($1, $2, 'attendance', 'Present at ' || $3, ('{"program": "' || $3 || '"}')::jsonb)`,
        [personId, orgId, programName]
      );
    }

    // Mark others absent
    const allActive = await client.query(
      `SELECT id FROM people WHERE organization_id = $1 AND status = 'active'`,
      [orgId]
    );
    const allActiveIds = allActive.rows.map(r => r.id);
    for (const id of allActiveIds) {
      if (!savedPeople.includes(id)) {
        await client.query(
          `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
           VALUES ($1, $2, false, $3)
           ON CONFLICT (member_id, attendance_date) DO NOTHING`,
          [id, today, sectionId]
        );
      }
    }

    client.release();

    return res.status(200).json({
      status: 'ok',
      present_count: savedPeople.length,
      absent_count: allActiveIds.length - savedPeople.length,
      new_members: newMembersCount,
      people: people,
    });
  } catch (error) {
    console.error('Vision scan error:', error);
    return res.status(200).json({ status: 'failed', error: error.message });
  }
  }
