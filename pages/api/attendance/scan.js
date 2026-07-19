import { supabaseAdmin } from '../../../lib/supabaseClient';
import { extractNamesFromImage } from '../../../utils/ocr';
import { matchNamesToMembers } from '../../../lib/fuzzyMatch';
import pool from '../../../lib/db';
import formidable from 'formidable';
import fs from 'fs';

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'Upload error' });

    const churchId = fields.church_id[0];
    const programName = fields.program_name?.[0] || 'GIBEON';
    const file = files.file[0];
    if (!file) return res.status(400).json({ error: 'No file' });

    try {
      // Upload to Supabase Storage
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

      // Extract names
      const extractedNames = await extractNamesFromImage(publicUrl);

      // Get existing members
      const client = await pool.connect();
      const membersRes = await client.query(
        `SELECT id, first_name, last_name FROM members WHERE church_id = $1 AND status = 'active'`,
        [churchId]
      );
      const membersList = membersRes.rows;

      // Match names
      const { presentIds, unmatched } = matchNamesToMembers(extractedNames, membersList);

      let newMembersCount = 0;

      // Add unmatched names as new members
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

      // Create session if needed
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

      // Get section ID
      const sectionRes = await client.query(
        `SELECT id FROM session_sections WHERE session_id = $1 AND name = 'All'`,
        [sessionId]
      );
      const sectionId = sectionRes.rows[0].id;

      // Mark all matched/added as present
      for (const memberId of presentIds) {
        await client.query(
          `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
           VALUES ($1, $2, true, $3)
           ON CONFLICT (member_id, attendance_date) DO UPDATE SET present = true`,
          [memberId, today, sectionId]
        );
      }

      // Mark other active members as absent
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
      console.error('Scan error:', error);
      return res.status(500).json({ error: error.message });
    }
  });
    }
