import fs from 'fs';
import path from 'path';
import Tesseract from 'tesseract.js';
import pool from '../../../lib/db';
import { matchNamesToMembers } from '../../../lib/fuzzyMatch';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { church_id, program_name, image_base64 } = req.body;

  if (!image_base64) {
    return res.status(400).json({ error: 'No image data received' });
  }

  const churchId = church_id || 'demo-church';
  const programName = program_name || 'GIBEON';

  try {
    // 1. Decode base64 and write temporary file
    const cleanBase64 = image_base64.replace(/\s/g, ''); // remove any spaces/newlines
    const buffer = Buffer.from(cleanBase64, 'base64');
    const tmpDir = '/tmp';
    const tmpFile = path.join(tmpDir, `scan-${Date.now()}.jpg`);
    fs.writeFileSync(tmpFile, buffer);

    // 2. Read the file back into a buffer (safer for Tesseract)
    const imageBuffer = fs.readFileSync(tmpFile);

    // 3. Run OCR using a buffer (not file path)
    const worker = await Tesseract.createWorker('eng');
    const { data: { text } } = await worker.recognize(imageBuffer);
    await worker.terminate();

    // Clean up temp file
    fs.unlinkSync(tmpFile);

    // 4. Parse lines and filter out obvious non‑name lines
    const rawLines = text.split('\n').map(line => line.trim()).filter(Boolean);

    const nameLines = rawLines.filter(line => {
      // Keep lines that look like a person's name or a phone number
      // Remove lines that are too short or contain typical header words
      if (line.length < 3) return false;
      if (/^(name|date|attendance|section|program|service|total)/i.test(line)) return false;
      // Keep if it contains at least one letter (likely a name) or is a phone number
      return /[a-zA-Z]/.test(line) || /^[0-9+\-\s]{8,}$/.test(line);
    });

    // 5. Convert each line to a name object (first_name, last_name)
    //    If a line contains a phone number, we'll later attach it to the previous name
    const extractedNames = [];
    let pendingPhone = null;

    nameLines.forEach(line => {
      // Check if line is primarily a phone number
      if (/^[0-9+\-\s]{8,}$/.test(line)) {
        pendingPhone = line.replace(/\s/g, '');
      } else {
        const parts = line.split(/\s+/);
        const nameObj = {
          first_name: parts[0],
          last_name: parts.slice(1).join(' '),
          phone: pendingPhone || '',   // attach any phone found before this name
        };
        extractedNames.push(nameObj);
        pendingPhone = null; // reset
      }
    });

    // If a phone was left at the end, add it to the last name (if any)
    if (pendingPhone && extractedNames.length > 0) {
      extractedNames[extractedNames.length - 1].phone = pendingPhone;
    }

    if (extractedNames.length === 0) {
      return res.status(400).json({ error: 'No names detected. Please ensure the photo is clear and contains handwritten names.' });
    }

    // ---------- Database operations (unchanged, but now using extractedNames with possible phones) ----------
    const client = await pool.connect();

    const membersRes = await client.query(
      `SELECT id, first_name, last_name FROM members WHERE church_id = $1 AND status = 'active'
       AND (deleted_at IS NULL OR deleted_at > NOW() - INTERVAL '30 days')`,
      [churchId]
    );
    const membersList = membersRes.rows;

    const { presentIds, unmatched } = matchNamesToMembers(extractedNames, membersList);
    let newMembersCount = 0;

    for (const nameObj of unmatched) {
      const firstName = nameObj.first_name;
      const lastName = nameObj.last_name;
      const phone = nameObj.phone || '';
      const insertRes = await client.query(
        `INSERT INTO members (church_id, first_name, last_name, phone, status, type)
         VALUES ($1, $2, $3, $4, 'active', 'visitor')
         RETURNING id`,
        [churchId, firstName, lastName, phone]
      );
      presentIds.push(insertRes.rows[0].id);
      newMembersCount++;
    }

    // (session and attendance marking code remains identical)
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

    const allActiveIds = membersList.map(m => m.id);
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
    });
  } catch (error) {
    console.error('Scan base64 error:', error);
    return res.status(500).json({ error: error.message || error.toString() });
  }
      }
