import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Force IPv4 to avoid ENETUNREACH errors
  family: 4,
});

export default pool;
