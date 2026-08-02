import pool from '../../../lib/db';
import { matchNamesToMembers } from '../../../lib/fuzzyMatch';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { church_id, program_name, image_base64 } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'No image data received' });

  let base64 = image_base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '');
  if (base64.length < 100) return res.status(400).json({ error: 'Image too small or corrupted.' });

  const orgId = church_id || 'demo-org';
  const programName = program_name || 'GIBEON';

  try {
    // 1. OCR via OCR.space (form‑encoded)
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
    console.log('Raw OCR text:', rawText);

    // 2. AI correction – now returns an array of { name, phone, confidence }
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
    console.log('Corrected people:', people);

    // ── HARD GUARD: never allow null/empty names ──
    const validPeople = (people || [])
      .filter(p => p.name && p.name.trim().length > 0)
      .map(p => ({
        first_name: p.name.trim(),
        last_name: '',
        phone: p.phone || '',
        confidence: p.confidence || 70,
      }));

    if (validPeople.length === 0) {
      // Fallback: use raw OCR lines as names so nothing is invisible
      console.log('No valid people after AI, using raw lines as names');
      const lines = rawText.split('\n').filter(l => l.trim());
      const fallbackPeople = lines.map(line => ({
        first_name: line.trim(),
        last_name: '',
        phone: '',
        confidence: 50,
      }));
      return res.status(200).json({
        status: 'ok',
        present_count: 0,
        absent_count: 0,
        new_members: 0,
        people: fallbackPeople,
      });
    }

    // 3. Save every person to the database
    const client = await pool.connect();
    let presentIds = [];
    let newMembersCount = 0;

    const existingRes = await client.query(
      `SELECT id, first_name, phone FROM people WHERE organization_id = $1 AND status = 'active'`,
      [orgId]
    );
    const existingList = existingRes.rows;
    const { presentIds: matched, unmatched } = matchNamesToMembers(validPeople, existingList);
    presentIds = matched;

    // Insert unmatched (new) people
    for (const person of unmatched) {
      const fullName = person.first_name;
      if (!fullName) continue; // safety

      let phone = person.phone || '';
      let memberId = null;

      // If phone exists, check for duplicate
      if (phone) {
        const existing = await client.query(
          `SELECT id FROM people WHERE organization_id = $1 AND phone = $2 AND status = 'active' LIMIT 1`,
          [orgId, phone]
        );
        if (existing.rows.length > 0) {
          memberId = existing.rows[0].id;
          await client.query(`UPDATE people SET first_name = $1 WHERE id = $2`, [fullName, memberId]);
          presentIds.push(memberId);
          continue;
        }
      }

      // Insert new person
      try {
        const insertRes = await client.query(
          `INSERT INTO people (organization_id, first_name, last_name, phone, type, status)
           VALUES ($1, $2, '', $3, 'visitor', 'active')
           RETURNING id`,
          [orgId, fullName, phone]
        );
        memberId = insertRes.rows[0].id;
        newMembersCount++;
      } catch (insertErr) {
        console.error(`Insert error for ${fullName}:`, insertErr.message);
        if (phone) {
          const retry = await client.query(
            `SELECT id FROM people WHERE organization_id = $1 AND phone = $2 LIMIT 1`,
            [orgId, phone]
          );
          if (retry.rows.length > 0) memberId = retry.rows[0].id;
        }
      }

      if (memberId) presentIds.push(memberId);
    }

    console.log('Present IDs:', presentIds.length);

    // 4. Record attendance and timeline
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

    for (const personId of presentIds) {
      try {
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
      } catch (attErr) {
        console.error(`Attendance insert error for person ${personId}:`, attErr.message);
      }
    }

    // Mark others absent
    const allActive = await client.query(
      `SELECT id FROM people WHERE organization_id = $1 AND status = 'active'`,
      [orgId]
    );
    const allActiveIds = allActive.rows.map(r => r.id);
    for (const id of allActiveIds) {
      if (!presentIds.includes(id)) {
        await client.query(
          `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
           VALUES ($1, $2, false, $3)
           ON CONFLICT (member_id, attendance_date) DO NOTHING`,
          [id, today, sectionId]
        );
      }
    }

    client.release();

    // Return the people who were actually saved
    return res.status(200).json({
      status: 'ok',
      present_count: presentIds.length,
      absent_count: allActiveIds.length - presentIds.length,
      new_members: newMembersCount,
      people: validPeople,   // the frontend can show these
    });
  } catch (error) {
    console.error('Scan error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
                  }
