import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method === 'GET' || req.method === 'POST') {
    try {
      // 1. Ensure people table exists (should already)
      await pool.query(`
        CREATE TABLE IF NOT EXISTS people (
          id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
          organization_id text NOT NULL DEFAULT 'demo-org',
          first_name text,
          last_name text,
          phone text,
          email text,
          type text DEFAULT 'visitor',
          status text DEFAULT 'active',
          metadata jsonb DEFAULT '{}',
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );
      `);

      // 2. Move any remaining members that aren't already in people
      await pool.query(`
        INSERT INTO people (id, organization_id, first_name, last_name, phone, type, status)
        SELECT id, church_id, first_name, '', phone,
               CASE WHEN type = 'member' THEN 'member' ELSE 'visitor' END,
               status
        FROM members
        WHERE id NOT IN (SELECT id FROM people)
      `);

      // 3. Update any attendance_records that still reference member_id not in people
      // (should not happen, but just in case)
      await pool.query(`
        UPDATE attendance_records ar
        SET member_id = (SELECT p.id FROM people p WHERE p.id = ar.member_id)
        WHERE member_id NOT IN (SELECT id FROM people)
      `);

      // 4. Drop the foreign key constraint that references members
      await pool.query(`
        ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_member_id_fkey
      `);

      // 5. Recreate the foreign key to reference people
      await pool.query(`
        ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_member_id_fkey
          FOREIGN KEY (member_id) REFERENCES people(id) ON DELETE CASCADE
      `);

      // 6. Drop the members table
      await pool.query(`DROP TABLE IF EXISTS members CASCADE`);

      res.status(200).json({ message: 'Merge complete. The members table has been dropped. Everything now uses people.' });
    } catch (err) {
      console.error('Merge/drop error:', err);
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(405).end();
  }
  }
