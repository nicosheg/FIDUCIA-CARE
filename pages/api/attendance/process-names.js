import pool from '../../../lib/db';
import { matchNamesToMembers } from '../../../lib/fuzzyMatch';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { church_id, program_name, names } = req.body;

  if (!names || !Array.isArray(names) || names.length === 0) {
    return res.status(400).json({ error: 'No names provided' });
  }

  const churchId = church_id || 'demo-church';
  const programName = program_name || 'GIBEON';
  const extractedNames = names;

  try {
    const client = await pool.connect();

    // Get existing active members
    const membersRes = await client.query(
      `SELECT id, first_name, last_name FROM members WHERE church_id = $1 AND status = 'active'`,
      [churchId]
    );
    const membersList = membersRes.rows;

    // Fuzzy match
    const { presentIds, unmatched } = matchNamesToMembers(extractedNames, membersList);
    let newMembersCount = 0;

    // Add unmatched as new members
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

    // Session handling
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

    // Mark present
    for (const memberId of presentIds) {
      await client.query(
        `INSERT INTO attendance_records (member_id, attendance_date, present, session_section_id)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (member_id, attendance_date) DO UPDATE SET present = true`,
        [memberId, today, sectionId]
      );
    }

    // Mark others absent
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
    console.error('Process names error:', error);
    return res.status(500).json({ error: error.message });
  }
}
