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

  if (!organizationId) {
    throw new Error('organizationId is required');
  }

  if (!type) {
    throw new Error('type is required');
  }

  if (!source) {
    throw new Error('source is required');
  }

  // PERSON_CREATED events are mapped into observations.
  // They therefore MUST have a deterministic key so retries cannot
  // create multiple logical creation events.
  if (type === 'PERSON_CREATED' && !eventKey) {
    throw new Error(
      'PERSON_CREATED requires a deterministic eventKey to ensure idempotency'
    );
  }

  // Audit-only events such as PERSON_UPDATED do not currently participate
  // in observation projection, so a unique timestamp-based fallback is
  // acceptable for Phase 5.1.
  const key =
    eventKey ||
    `${source}:${organizationId}:${type}:${personId || 'global'}:${Date.now()}`;

  const query = `
    INSERT INTO aria_events (
      organization_id,
      person_id,
      type,
      actor_id,
      source,
      metadata,
      event_key
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (event_key) DO NOTHING
    RETURNING *
  `;

  const values = [
    organizationId,
    personId,
    type,
    actorId,
    source,
    metadata,
    key,
  ];

  const result = await db.query(query, values);

  // Duplicate deterministic event:
  // return null rather than pretending a new event was created.
  return result.rows[0] || null;
}
