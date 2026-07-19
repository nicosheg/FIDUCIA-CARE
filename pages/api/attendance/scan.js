import { supabaseAdmin } from '../../../lib/supabaseClient';
import { extractNamesFromImage } from '../../../utils/ocr';
import { matchNamesToMembers } from '../../../lib/fuzzyMatch';
import pool from '../../../lib/db';   // use direct PostgreSQL for sessions
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'File upload error' });

    const churchId = fields.church_id[0];
    const programName = fields.program_name[0] || 'GIBEON';
    const file = files.file[0];
    if (!file) return res.status(400).json({ error: 'No file' });

    // 1. Upload image to Supabase Storage (keep existing logic)
    const fileBuffer = fs.readFileSync(file.filepath);
    const fileExt = file.originalFilename.split('.').pop();
    const filePath = `${churchId}/${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from('attendance')
      .upload(filePath, fileBuffer, { contentType: file.mimetype });
    if (uploadError) return res.status(500).json({ error: uploadError.message });
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('attendance')
      .getPublicUrl(filePath);

    // 2. Extract names (free OCR)
    const extractedNames = await extractNamesFromImage(publicUrl);

    // 3. Connect to database (direct pool)
    const client = await pool.connect();
    try {
      // --- Session handling ---
      // Check if a session with this program name already exists for today
      const today = new Date().toISOString().slice(0, 10);
      let sessionRes = await client.query(
        `SELECT id FROM sessions WHERE church_id = $1 AND name = $2 AND created_at::date = $3`,
        [churchId, programName, today]
      );
      let sessionId;
      if (sessionRes.rows.length === 0) {
        // Create new session
        const newSession = await client.query(
          `INSERT INTO sessions (church_id, name, status) VALUES ($1, $2, 'active') RETURNING id`,
          [churchId, programName]
        );
        sessionId = newSession.rows[0].id;
        // Create a default "All" section for this session
        await client.query(
          `INSERT INTO session_sections (session_id, name) VALUES ($1, 'All')`,
          [sessionId]
        );
      } else {
        sessionId = sessionRes.rows[0].id;
      }

      // --- Member matching & creation ---
      const { presentIds, unmatched } = matchNamesToMembers(extractedNames, []);
      let newMembersCount = 0;

      // For unmatched names, create new members
      for (const fullName of unmatched) {
        const parts = fullName.split(' ');
        const first_name = parts[0];
        const last_name = parts.slice(1).join(' ');
        const insertRes = await client.query(
          `INSERT INTO members (church_id, first_name, last_name, phone, status, type)
           VALUES ($1, $2, $3, '', 'active', 'visitor')
           RETURNING id`,
          [churchId, first_name, last_name]
        );
        presentIds.push(insertRes.rows[0].id);
        newMembersCount++;
      }

      // For already matched members (if any), presentIds already contains their IDs.
      // We need to fetch matched member IDs as well. The current matchNamesToMembers function returns presentIds from existing members? Actually we passed empty array for members, so it only returns unmatched. Let's adjust: we should pass all existing active members to the matching function so we can get both matched and unmatched. We'll correct that.

      // Get all active members for the church
      const membersRes = await client.query(
        `SELECT id, first_name, last_name FROM members WHERE church_id = $1 AND status = 'active'`,
        [churchId]
      );
      const membersList = membersRes.rows;

      // Re-run matching with the real member list
      const { presentIds: matchedIds, unmatched: unmatchedNames } = matchNamesToMembers(
        extractedNames,
        membersList
      );

      // Add unmatched names as new members
      for (const fullName of unmatchedNames) {
        const parts = fullName.split(' ');
        const first_name = parts[0];
        const last_name = parts.slice(1).join(' ');
        const insertRes = await client.query(
          `INSERT INTO members (church_id, first_name, last_name, phone, status, type)
           VALUES ($1, $2, $3, '', 'active', 'visitor')
           RETURNING id`,
          [churchId, first_name, last_name]
        );
        matchedIds.push(insertRes.rows[0].id);
        newMembersCount++;
      }

      // Mark all matched IDs as present for the session's "All" section
      const sectionRes = await client.query(
        `SELECT id FROM session_sections WHERE session_id = $1 AND name = 'All'`,
        [sessionId]
      );
      const sectionId = sectionRes.rows[0].id;

      for (const memberId of matchedIds) {
        await client.query(
          `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
           VALUES ($1, $2, true, $3)
           ON CONFLICT (member_id, attendance_date) DO UPDATE SET present = true, session_section_id = $3`,
          [memberId, today, sectionId]
        );
      }

      // Also mark all other active members as absent for today? (optional – for completeness)
      const allActiveIds = membersList.map(m => m.id);
      for (const id of allActiveIds) {
        if (!matchedIds.includes(id)) {
          await client.query(
            `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
             VALUES ($1, $2, false, $3)
             ON CONFLICT (member_id, attendance_date) DO NOTHING`,
            [id, today, sectionId]
          );
        }
      }

      return res.status(200).json({
        status: 'ok',
        present_count: matchedIds.length,
        absent_count: allActiveIds.length - matchedIds.length,
        new_members: newMembersCount,
      });
    } catch (dbErr) {
      console.error(dbErr);
      return res.status(500).json({ error: dbErr.message });
    } finally {
      client.release();
    }
  });
      }
