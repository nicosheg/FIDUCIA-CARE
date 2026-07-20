import pool from '../../../lib/db';
import { matchNamesToMembers } from '../../../lib/fuzzyMatch';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { church_id, program_name, image_base64 } = req.body;
  if (!image_base64) {
    return res.status(400).json({ error: 'No image data received' });
  }

  let base64 = image_base64.replace(/^data:image\/\w+;base64,/, '').replace(/\s/g, '');
  if (base64.length < 100) {
    return res.status(400).json({ error: 'Image too small or corrupted. Please retake the photo.' });
  }

  const churchId = church_id || 'demo-church';
  const programName = program_name || 'GIBEON';

  try {
    // ── 1. OCR via OCR.space ──
    const params = new URLSearchParams();
    params.append('base64Image', `data:image/jpeg;base64,${base64}`);
    params.append('apikey', 'helloworld');
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
      return res.status(400).json({ error: `OCR failed: ${errMsg}` });
    }

    const rawText = ocrData.ParsedResults[0].ParsedText;

    // ── 2. AI Correction & Structuring ──
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
    if (!people || people.length === 0) {
      return res.status(400).json({ error: 'No people found in the image.' });
    }

    // ── 3. Separate high‑confidence (>90) and low‑confidence entries ──
    const highConfidence = people.filter(p => p.confidence >= 90);
    const lowConfidence = people.filter(p => p.confidence < 90);

    // ── 4. Save high‑confidence immediately ──
    const client = await pool.connect();
    let presentIds = [];
    let newMembersCount = 0;

    if (highConfidence.length > 0) {
      const membersRes = await client.query(
        `SELECT id, first_name, last_name FROM members WHERE church_id = $1 AND status = 'active'`,
        [churchId]
      );
      const membersList = membersRes.rows;

      const { presentIds: matched, unmatched } = matchNamesToMembers(highConfidence, membersList);
      presentIds = matched;

      for (const person of unmatched) {
        const firstName = person.first_name;
        const lastName = person.last_name || '';
        const phone = person.phone || '';
        const insertRes = await client.query(
          `INSERT INTO members (church_id, first_name, last_name, phone, status, type)
           VALUES ($1, $2, $3, $4, 'active', 'visitor')
           RETURNING id`,
          [churchId, firstName, lastName, phone]
        );
        presentIds.push(insertRes.rows[0].id);
        newMembersCount++;
      }
    }

    // ── 5. Attendance recording (for high confidence only, low confidence stored for later review) ──
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
      await client.query(
        `INSERT INTO session_sections (session_id, name) VALUES ($1, 'All')`,
        [sessionId]
      );
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
         VALUES ($1, $2, true, $3)
         ON CONFLICT (member_id, attendance_date) DO UPDATE SET present = true`,
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
           VALUES ($1, $2, false, $3)
           ON CONFLICT (member_id, attendance_date) DO NOTHING`,
          [id, today, sectionId]
        );
      }
    }

    client.release();

    return res.status(200).json({
      status: 'ok',
      present_count: presentIds.length,
      absent_count: allActiveIds.length - presentIds.length,
      new_members: newMembersCount,
      low_confidence: lowConfidence, // return these for review
      reviewed: highConfidence.length,
    });
  } catch (error) {
    console.error('AI‑corrected scan error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
      }
