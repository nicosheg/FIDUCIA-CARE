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
    // Write base64 image to a temporary file on Render's disk
    const tmpDir = '/tmp';
    const tmpFile = path.join(tmpDir, `scan-${Date.now()}.jpg`);
    const buffer = Buffer.from(image_base64, 'base64');
    fs.writeFileSync(tmpFile, buffer);

    // Run OCR using Tesseract.js
    const worker = await Tesseract.createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist:
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+ ',
      preserve_interword_spaces: '1',
    });
    const {
      data: { text },
    } = await worker.recognize(tmpFile);
    await worker.terminate();

    // Clean up the temporary file
    fs.unlinkSync(tmpFile);

    // Parse the OCR text into names
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const extractedNames = lines.map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length === 1) return { first_name: parts[0], last_name: '' };
      return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
    });

    if (extractedNames.length === 0) {
      return res.status(400).json({
        error: 'No names detected. Please ensure the photo is clear and contains handwritten names.',
      });
    }

    // ---------- Database operations (direct PostgreSQL, no Supabase Storage) ----------
    const client = await pool.connect();

    // Fetch existing active members
    const membersRes = await client.query(
      `SELECT id, first_name, last_name FROM members
       WHERE church_id = $1 AND status = 'active'
         AND (deleted_at IS NULL OR deleted_at > NOW() - INTERVAL '30 days')`,
      [churchId]
    );
    const membersList = membersRes.rows;

    // Fuzzy match extracted names against existing members
    const { presentIds, unmatched } = matchNamesToMembers(extractedNames, membersList);
    let newMembersCount = 0;

    // Create new members for unmatched names
    for (const fullName of unmatched) {
      const parts = fullName.split(' ');
      const firstName = parts[0];
      const lastName = parts.slice(1).join(' ');
      const insertRes = await client.query(
        `INSERT INTO members (church_id, first_name, last_name, phone, status, type)
         VALUES ($1, $2, $3, '', 'active', 'visitor')
         RETURNING id`,
        [churchId, firstName, lastName]
      );
      presentIds.push(insertRes.rows[0].id);
      newMembersCount++;
    }

    // Session handling (create or reuse today's session for this program)
    const today = new Date().toISOString().slice(0, 10);
    let sessionRes = await client.query(
      `SELECT id FROM sessions
       WHERE church_id = $1 AND name = $2 AND created_at::date = $3`,
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

    // Get the "All" section ID
    const sectionRes = await client.query(
      `SELECT id FROM session_sections WHERE session_id = $1 AND name = 'All'`,
      [sessionId]
    );
    const sectionId = sectionRes.rows[0].id;

    // Mark matched/added members as present
    for (const memberId of presentIds) {
      await client.query(
        `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (member_id, attendance_date) DO UPDATE SET present = true`,
        [memberId, today, sectionId]
      );
    }

    // Mark other active members as absent
    const allActiveIds = membersList.map((m) => m.id);
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
    // Now the frontend will see the real error message
    console.error('Scan base64 error:', error);
    return res.status(500).json({ error: error.message || error.toString() });
  }
           }
