// lib/aria/organizationMemory.js
import pool from '../db';

/**
 * Store a memory entry for an organization.
 */
export async function setMemory(orgId, memoryType, memoryKey, value) {
    await pool.query(
        `INSERT INTO organization_memory (organization_id, memory_type, memory_key, memory_value)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, memory_type, memory_key) DO UPDATE SET
           memory_value = EXCLUDED.memory_value,
           updated_at = NOW()`,
        [orgId, memoryType, memoryKey, JSON.stringify(value)]
    );
}

/**
 * Retrieve memory entries.
 */
export async function getMemory(orgId, memoryType = null, memoryKey = null) {
    let query = `SELECT * FROM organization_memory WHERE organization_id = $1`;
    const params = [orgId];
    if (memoryType) {
        query += ` AND memory_type = $2`;
        params.push(memoryType);
    }
    if (memoryKey) {
        query += ` AND memory_key = $3`;
        params.push(memoryKey);
    }
    query += ` ORDER BY created_at DESC`;
    const res = await pool.query(query, params);
    return res.rows;
}
