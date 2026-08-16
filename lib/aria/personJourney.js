// lib/aria/personJourney.js
import pool from '../db';

/**
 * Record a journey event for a person.
 */
export async function recordJourneyEvent(orgId, personId, eventType, eventData = {}) {
    await pool.query(
        `INSERT INTO person_journey_events (organization_id, person_id, event_type, event_data)
         VALUES ($1, $2, $3, $4)`,
        [orgId, personId, eventType, JSON.stringify(eventData)]
    );
}

/**
 * Get the full journey timeline for a person.
 */
export async function getPersonJourney(orgId, personId) {
    const res = await pool.query(
        `SELECT event_type, event_data, created_at
         FROM person_journey_events
         WHERE organization_id = $1 AND person_id = $2
         ORDER BY created_at ASC`,
        [orgId, personId]
    );
    return res.rows;
}

/**
 * Get the latest journey event for a person.
 */
export async function getLatestJourneyEvent(orgId, personId) {
    const res = await pool.query(
        `SELECT event_type, event_data, created_at
         FROM person_journey_events
         WHERE organization_id = $1 AND person_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [orgId, personId]
    );
    return res.rows[0] || null;
}
