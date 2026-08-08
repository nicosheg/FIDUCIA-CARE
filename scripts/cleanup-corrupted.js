const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function cleanup() {
  const client = await pool.connect();
  try {
    const suspicious = await client.query(`
      SELECT id, first_name, phone, created_at
      FROM people
      WHERE organization_id = 'demo-org'
        AND (
          LENGTH(first_name) > 50
          OR first_name ILIKE '%**%'
          OR first_name ~ '^[0-9]+\.'
          OR first_name ILIKE '%let''s%'
          OR first_name ILIKE '%re-read%'
          OR first_name ILIKE '%carefully%'
          OR first_name ILIKE '%illegible%'
          OR first_name ILIKE '%faint%'
          OR first_name ILIKE '%->%'
          OR first_name ILIKE '%<think>%'
          OR first_name ILIKE '%the user wants%'
          OR first_name ILIKE '%analyze the image%'
          OR first_name ILIKE '%i will%'
        )
    `);

    console.log(`Found ${suspicious.rows.length} suspicious records.`);
    console.table(suspicious.rows);

    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await new Promise(resolve => {
      readline.question('Delete these records? (yes/no) ', resolve);
    });
    readline.close();

    if (answer.toLowerCase() === 'yes') {
      const ids = suspicious.rows.map(r => r.id);
      await client.query(`DELETE FROM people WHERE id = ANY($1)`, [ids]);
      console.log(`Deleted ${ids.length} records.`);
    } else {
      console.log('Cleanup cancelled.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
  }
}

cleanup();
