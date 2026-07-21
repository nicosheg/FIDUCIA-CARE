import pool from '../../../lib/db';
import { matchNamesToMembers } from '../../../lib/fuzzyMatch';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { church_id, program_name, image_base64 } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'No image data received' });

  let base64 = image_base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '');
  if (base64.length < 100) return res.status(400).json({ error: 'Image too small or corrupted.' });

  const churchId = church_id || 'demo-church';
  const programName = program_name || 'GIBEON';

  try {
    // 1. OCR
    console.log('Starting OCR...');
    const params = new URLSearchParams();
    params.append('base64Image', `data:image/jpeg;base64,${base64}`);
    params.append('apikey', process.env.OCR_SPACE_API_KEY || 'helloworld');
    params.append('language', 'eng');
    params.append('isOverlayRequired', 'false');
    params.append('detectOrientation', 'true');
    params.append('scale', 'true');
    params.append('OCREngine', '2');
    const ocrRes = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const ocrData = await ocrRes.json();
    if (ocrData.IsErroredOnProcessing || !ocrData.ParsedResults?.length) {
      const errMsg = ocrData.ErrorMessage || 'No parsed results';
      console.error('OCR failed:', errMsg);
      return res.status(400).json({ error: `OCR failed: ${errMsg}` });
    }
    const rawText = ocrData.ParsedResults[0].ParsedText;

    // 2. AI correction
    const aiRes = await fetch(`${req.headers.origin || 'http://localhost:3000'}/api/ai/correct-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText }),
    });
    if (!aiRes.ok) {
      const err = await aiRes.json();
      return res.status(500).json({ error: 'AI correction failed: ' + (err.error || 'unknown') });
    }
    const { people } = await aiRes.json();
    if (!people || people.length === 0) return res.status(400).json({ error: 'No people found.' });

    // 3. Show everything immediately – no filtering out low confidence yet
    const allPeople = people.map(p => ({
      first_name: p.name?.trim() || 'Unknown',
      last_name: '',
      phone: p.phone || '',
      confidence: p.confidence || 70,
    }));

    // 4. Insert EVERYBODY (confidence threshold = 0)
    const client = await pool.connect();
    let presentIds = [];
    let newMembersCount = 0;

    const membersRes = await client.query(
      `SELECT id, first_name, last_name, phone FROM members WHERE church_id = $1 AND status = 'active'`,
      [churchId]
    );
    const membersList = membersRes.rows;

    for (const person of allPeople) {
      const fullName = person.first_name;
      if (!fullName || fullName === 'Unknown') continue;
      let phone = person.phone || '';
      let memberId = null;

      console.log(`Processing: ${fullName}, phone: ${phone}, confidence: ${person.confidence}`);

      // 1) Check if phone already exists
      if (phone) {
        const existing = await client.query(
          `SELECT id FROM members WHERE church_id = $1 AND phone = $2 LIMIT 1`,
          [churchId, phone]
        );
        if (existing.rows.length > 0) {
          memberId = existing.rows[0].id;
          await client.query(`UPDATE members SET first_name = $1, last_name = '' WHERE id = $2`, [fullName, memberId]);
          console.log(`Updated existing member by phone: ${fullName}`);
          presentIds.push(memberId);
          continue;
        }
      }

      // 2) Insert new member
      try {
        const insertRes = await client.query(
          `INSERT INTO members (church_id, first_name, last_name, phone, status, type)
           VALUES ($1, $2, '', $3, 'active', 'visitor') RETURNING id`,
          [churchId, fullName, phone]
        );
        memberId = insertRes.rows[0].id;
        console.log(`Inserted ${fullName} with id ${memberId}`);
        newMembersCount++;
        presentIds.push(memberId);
      } catch (err) {
        console.error(`Insert error for ${fullName}:`, err.message);
        // Try without phone
        try {
          const insertNoPhone = await client.query(
            `INSERT INTO members (church_id, first_name, last_name, phone, status, type)
             VALUES ($1, $2, '', '', 'active', 'visitor') RETURNING id`,
            [churchId, fullName]
          );
          memberId = insertNoPhone.rows[0].id;
          console.log(`Inserted ${fullName} without phone, id ${memberId}`);
          newMembersCount++;
          presentIds.push(memberId);
        } catch (err2) {
          console.error(`Second insert error for ${fullName}:`, err2.message);
        }
      }
    }

    console.log('Present IDs after insert:', presentIds.length);

    // 5. Record attendance for all presentIds
    const today = new Date().toISOString().slice(0, 10);
    let sessionRes = await client.query(
      `SELECT id FROM sessions WHERE church_id = $1 AND name = $2 AND created_at::date = $3`,
      [churchId, programName, today]
    );
    let sessionId;
    if (sessionRes.rows.length === 0) {
      const newSession = await client.query(
        `INSERT INTO sessions (church_id, name, status) VALUES ($1, $2, 'active') RETURNING id`,
        [churchId, programName]
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

    for (const memberId of presentIds) {
      await client.query(
        `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
         VALUES ($1, $2, true, $3) ON CONFLICT (member_id, attendance_date) DO UPDATE SET present = true`,
        [memberId, today, sectionId]
      );
    }

    // Mark others absent
    const allActive = await client.query(
      `SELECT id FROM members WHERE church_id = $1 AND status = 'active'`,
      [churchId]
    );
    const allActiveIds = allActive.rows.map(r => r.id);
    for (const id of allActiveIds) {
      if (!presentIds.includes(id)) {
        await client.query(
          `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
           VALUES ($1, $2, false, $3) ON CONFLICT (member_id, attendance_date) DO NOTHING`,
          [id, today, sectionId]
        );
      }
    }

    client.release();

    const result = {
      status: 'ok',
      present_count: presentIds.length,
      absent_count: allActiveIds.length - presentIds.length,
      new_members: newMembersCount,
      people: allPeople, // send back the full list so frontend can display confidence
    };
    console.log('Scan result:', result);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Scan pipeline error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
      }
