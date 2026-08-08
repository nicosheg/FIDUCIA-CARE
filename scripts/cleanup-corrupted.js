const pool = require('../lib/db');

async function cleanup() {
  const client = await pool.connect();
  try {
    // Find suspicious records:
    // - name longer than 100 chars
    // - name containing reasoning patterns
    // - name with <think>, markdown, etc.
    // - name with multiple sentences (contains . ? !)
    const suspicious = await client.query(`
      SELECT id, first_name, phone, created_at
      FROM people
      WHERE organization_id = 'demo-org'
        AND (
          LENGTH(first_name) > 100
          OR first_name ILIKE '%<think>%'
          OR first_name ILIKE '%the user wants%'
          OR first_name ILIKE '%analyze the image%'
          OR first_name ILIKE '%i will%'
          OR first_name ILIKE '%let''s%'
          OR first_name ~ '[.!?][A-Z]'  -- multiple sentences
          OR first_name LIKE '```%'     -- markdown
          OR first_name LIKE '%```%'
        )
    `);

    console.log(`Found ${suspicious.rows.length} suspicious records.`);
    console.table(suspicious.rows);

    // Ask for confirmation before deletion
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
