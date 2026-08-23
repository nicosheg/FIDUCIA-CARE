// lib/aria/eventEmitter.js
import pool from '../db';

/**
 * Emit a canonical ARIA event.
 * - idempotency: event_key ensures duplicate events are ignored.
 * - returns the inserted event row (or null if duplicate).
 */
export async function emitAriaEvent({
  organizationId,
  personId = null,
  type,
  actorId = null,
  source,
  metadata = {},
  eventKey = null,
}) {
  if (!organizationId) throw new Error('organizationId is required');
  if (!type) throw new Error('type is required');
  if (!source) throw new Error('source is required');

  // Generate event_key if not provided
  const key = eventKey || `${source}:${organizationId}:${type}:${personId || 'global'}:${Date.now()}`;

  const query = `
    INSERT INTO aria_events (organization_id, person_id, type, actor_id, source, metadata, event_key)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (event_key) DO NOTHING
    RETURNING *
  `;
  const values = [organizationId, personId, type, actorId, source, metadata, key];
  const result = await pool.query(query, values);
  return result.rows[0] || null;
}
