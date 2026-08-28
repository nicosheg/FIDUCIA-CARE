// lib/db.js
// Canonical PostgreSQL connection pool.
// IPv4 is retained for the current deployment environment.

import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  family: 4,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

pool.on('error', err => {
  console.error('[DB] Unexpected idle client error:', err);
});

export default pool;
