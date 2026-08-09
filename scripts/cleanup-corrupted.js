// scripts/cleanup-corrupted.js – Identifies and quarantines corrupted records

const pool = require('../lib/db');

async function cleanup() {
  const client = await pool.connect();
  try {
    // Detect suspicious records
    const suspicious = await client.query(`
      SELECT id, first_name, phone, created_at
      FROM people
      WHERE organization_id = 'demo-org'
        AND (
          LENGTH(first_name) > 60
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
          OR first_name ~ '([.!?]\\s+){2,}'  -- multiple sentences
        )
    `);

    console.log(`Found ${suspicious.rows.length} suspicious records.`);
    console.table(suspicious.rows);

    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await new Promise(resolve => {
      readline.question('Quarantine these records (move to quarantine table)? (yes/no) ', resolve);
    });
    readline.close();

    if (answer.toLowerCase() === 'yes') {
      // Ensure quarantine table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS quarantine_people (
          id UUID PRIMARY KEY,
          original_id UUID,
          first_name TEXT,
          phone TEXT,
          reason TEXT,
          quarantined_at TIMESTAMP DEFAULT NOW()
        )
      `);
      for (const row of suspicious.rows) {
        await client.query(
          `INSERT INTO quarantine_people (original_id, first_name, phone, reason)
           VALUES ($1, $2, $3, 'Corrupted by AI reasoning')`,
          [row.id, row.first_name, row.phone]
        );
        // Delete from people
        await client.query(`DELETE FROM people WHERE id = $1`, [row.id]);
      }
      console.log(`Quarantined ${suspicious.rows.length} records.`);
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
