// lib/aria/eventEmitter.js
import pool from '../db';

export async function emitAriaEvent({
  organizationId,
  personId = null,
  type,
  actorId = null,
  source,
  metadata = {},
  eventKey = null,
}, client = null) {
  const db = client || pool;
  if (!organizationId) throw new Error('organizationId is required');
  if (!type) throw new Error('type is required');
  if (!source) throw new Error('source is required');

  const key = eventKey || `${source}:${organizationId}:${type}:${personId || 'global'}:${Date.now()}`;

  const query = `
    INSERT INTO aria_events (organization_id, person_id, type, actor_id, source, metadata, event_key)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (event_key) DO NOTHING
    RETURNING *
  `;
  const values = [organizationId, personId, type, actorId, source, metadata, key];
  const result = await db.query(query, values);
  return result.rows[0] || null;
}
