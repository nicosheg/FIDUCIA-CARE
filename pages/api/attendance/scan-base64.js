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
    console.log('OCR raw text:', rawText);

    // 2. AI correction & structuring
    const aiRes = await fetch(`${req.headers.origin || 'http://localhost:3000'}/api/ai/correct-scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText }),
    });
    if (!aiRes.ok) {
      const err = await aiRes.json();
      console.error('AI correction failed:', err);
      return res.status(500).json({ error: 'AI correction failed: ' + (err.error || 'unknown') });
    }
    const { people } = await aiRes.json();
    console.log('AI returned', people.length, 'people');

    if (!people || people.length === 0) return res.status(400).json({ error: 'No people found.' });

    // 3. Clean & filter
    const validPeople = people
      .filter(p => p.name && p.name.trim().length > 0)
      .map(p => ({
        first_name: p.name.trim(),
        last_name: '',
        phone: p.phone || '',
        confidence: p.confidence || 70,
      }));
    console.log('Valid people after filtering:', validPeople.length);

    if (validPeople.length === 0) {
      console.log('No valid people after filtering');
      return res.status(400).json({ error: 'No valid names after filtering.' });
    }

    // 4. Split by confidence
    const highConfidence = validPeople.filter(p => p.confidence >= 90);
    const lowConfidence = validPeople.filter(p => p.confidence < 90);
    console.log('High confidence:', highConfidence.length, 'Low confidence:', lowConfidence.length);

    // 5. Save high‑confidence members + attendance
    const client = await pool.connect();
    let presentIds = [];
    let newMembersCount = 0;

    if (highConfidence.length > 0) {
      const membersRes = await client.query(
        `SELECT id, first_name, last_name, phone FROM members WHERE church_id = $1 AND status = 'active'`,
        [churchId]
      );
      const membersList = membersRes.rows;
      const { presentIds: matched, unmatched } = matchNamesToMembers(highConfidence, membersList);
      presentIds = matched;
      console.log('Matched existing:', matched.length, 'Unmatched:', unmatched.length);

      // For each unmatched high‑confidence person, try to insert; if phone already exists, update the name instead
      for (const person of unmatched) {
        const fullName = person.first_name;
        if (!fullName) continue;
        const phone = person.phone || '';

        try {
          // If a phone number is present and already exists, update that member's name and mark them present
          if (phone) {
            const existing = await client.query(
              `SELECT id FROM members WHERE church_id = $1 AND phone = $2 AND status = 'active' LIMIT 1`,
              [churchId, phone]
            );
            if (existing.rows.length > 0) {
              // Update the name and add to presentIds
              await client.query(
                `UPDATE members SET first_name = $1, last_name = '' WHERE id = $2`,
                [fullName, existing.rows[0].id]
              );
              presentIds.push(existing.rows[0].id);
              continue; // skip insertion
            }
          }

          // Insert new member
          const insertRes = await client.query(
            `INSERT INTO members (church_id, first_name, last_name, phone, status, type)
             VALUES ($1, $2, '', $3, 'active', 'visitor') RETURNING id`,
            [churchId, fullName, phone]
          );
          presentIds.push(insertRes.rows[0].id);
          newMembersCount++;
        } catch (insertErr) {
          console.error(`Insert error for ${fullName} (${phone}):`, insertErr.message);
          // If insert fails (e.g., duplicate phone constraint), try to find existing by phone and use that
          if (phone) {
            const existing = await client.query(
              `SELECT id FROM members WHERE church_id = $1 AND phone = $2 LIMIT 1`,
              [churchId, phone]
            );
            if (existing.rows.length > 0) {
              presentIds.push(existing.rows[0].id);
            }
          }
        }
      }
    }

    console.log('Present IDs after insert:', presentIds.length);

    // 6. Attendance recording
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

    // 7. Save low‑confidence entries to pending_reviews
    const validLow = lowConfidence.filter(p => p.first_name?.trim());
    if (validLow.length > 0) {
      const flatValues = [];
      const placeholders = validLow.map((p, i) => {
        const base = i * 6 + 1;
        flatValues.push(churchId, sessionId, p.first_name, '', p.phone || '', p.confidence);
        return `($${base}, $${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5})`;
      }).join(', ');
      await pool.query(
        `INSERT INTO pending_reviews (church_id, session_id, first_name, last_name, phone, confidence)
         VALUES ${placeholders}`,
        flatValues
      );
    }

    const result = {
      status: 'ok',
      present_count: presentIds.length,
      absent_count: allActiveIds.length - presentIds.length,
      new_members: newMembersCount,
      pending_review: validLow.length,
    };
    console.log('Scan result:', result);
    return res.status(200).json(result);
  } catch (error) {
    console.error('AI‑corrected scan error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
      }
