import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method === 'GET' || req.method === 'POST') {
    try {
      // 1. Create people table if it doesn't exist
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

      // 2. Migrate all members that aren't already in people
      await pool.query(`
        INSERT INTO people (id, organization_id, first_name, last_name, phone, type, status)
        SELECT id, 'demo-org', first_name, '', phone,
               CASE WHEN type = 'member' THEN 'member' ELSE 'visitor' END,
               status
        FROM members
        WHERE id NOT IN (SELECT id FROM people)
      `);

      // 3. Update any existing people that still have the old church_id
      await pool.query(`
        UPDATE people SET organization_id = 'demo-org'
        WHERE organization_id = 'demo-church'
      `);

      // 4. Update all related tables to use demo-org
      await pool.query(`UPDATE sessions SET church_id = 'demo-org' WHERE church_id = 'demo-church'`);
      await pool.query(`UPDATE attendance_records SET church_id = 'demo-org' WHERE church_id = 'demo-church'`);
      await pool.query(`UPDATE pending_reviews SET church_id = 'demo-org' WHERE church_id = 'demo-church'`);
      await pool.query(`UPDATE timeline_events SET organization_id = 'demo-org' WHERE organization_id = 'demo-church'`);

      // 5. Create timeline_events table if missing
      await pool.query(`
        CREATE TABLE IF NOT EXISTS timeline_events (
          id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
          person_id uuid REFERENCES people(id) ON DELETE CASCADE,
          organization_id text NOT NULL DEFAULT 'demo-org',
          event_type text NOT NULL,
          channel text,
          description text,
          metadata jsonb DEFAULT '{}',
          created_at timestamptz DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_timeline_person ON timeline_events(person_id, created_at DESC);
      `);

      res.status(200).json({ message: 'Migration complete. All data uses organization ID demo-org.' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  } else {
    res.status(405).end();
  }
  }
