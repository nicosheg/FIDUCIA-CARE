// lib/aria/eventProcessor.js
import pool from '../db';
import { createObservation } from './observationEngine';
import { updatePersonState } from './stateManager';

export async function processAriaEvent(event, client = null) {
  const db = client || pool;

  if (!event) {
    throw new Error('ARIA event is required');
  }

  const {
    id: eventId,
    organization_id: orgId,
    person_id: personId,
    type,
    source,
    metadata = {},
  } = event;

  if (!eventId) {
    throw new Error('ARIA event id is required');
  }

  if (!orgId) {
    throw new Error('ARIA event organization_id is required');
  }

  if (!type) {
    throw new Error('ARIA event type is required');
  }

  // Global/audit events without a person do not currently project
  // into person observations or person state.
  if (!personId) {
    console.log(
      `[ARIA] Skipping event ${eventId} (no person_id)`
    );
    return null;
  }

  /*
   * Phase 5.1 observation idempotency.
   *
   * source_event_id is stored by observationEngine inside:
   * metadata.source_event_id
   *
   * We deliberately compare as TEXT rather than casting the JSON value
   * to UUID. This prevents malformed metadata from causing a database
   * cast exception.
   *
   * organization_id is included to preserve tenant isolation.
   *
   * NOTE:
   * This is still a check-then-insert pattern. Without a database
   * uniqueness constraint on the JSON metadata expression, two
   * concurrent processors could theoretically both pass this check.
   *
   * That hardening belongs to a later phase because Phase 4 schema
   * remains frozen.
   */
  const existingObs = await db.query(
    `
      SELECT id
      FROM aria_observations
      WHERE organization_id = $1
        AND metadata->>'source_event_id' = $2::text
      LIMIT 1
    `,
    [orgId, eventId]
  );

  if (existingObs.rows.length > 0) {
    console.log(
      `[ARIA] Observation already exists for event ${eventId}, skipping.`
    );
    return null;
  }

  let observationType = null;
  let confidence = 0.7;
  let severity = 'medium';
  let urgency = 'medium';

  let evidence = {
    sources: source ? [source] : [],
    facts: [],
    inference: '',
  };

  switch (type) {
    case 'PERSON_CREATED': {
      observationType = 'NEW_PERSON';

      /*
       * visionProcessor emits confidence as 0–100.
       * observationEngine expects confidence as 0–1.
       *
       * Only accept an actual number and clamp the final result.
       */
      confidence =
        typeof metadata.confidence === 'number'
          ? Math.min(
              1,
              Math.max(0, metadata.confidence / 100)
            )
          : 0.7;

      severity = 'medium';
      urgency = 'medium';

      evidence = {
        sources: source ? [source] : [],
        facts: [
          `Created from ${source || 'unknown'}`,
          `Program: ${metadata.programName || 'unknown'}`,
        ],
        inference: 'New person discovered',
      };

      break;
    }

    case 'PERSON_UPDATED': {
      /*
       * Phase 5.1 intentionally records PERSON_UPDATED as an event only.
       * No observation projection occurs yet.
       */
      console.log(
        `[ARIA] PERSON_UPDATED event ${eventId} recorded but not observed ` +
        `(Phase 5.1 deferral)`
      );

      return null;
    }

    default: {
      console.log(
        `[ARIA] No observation mapping for event type: ${type}`
      );

      return null;
    }
  }

  if (!observationType) {
    return null;
  }

  const obsId = await createObservation(
    {
      organizationId: orgId,
      personId,
      type: observationType,
      confidence,
      severity,
      urgency,
      evidence,
      expiresAt: null,
      sourceEventId: eventId,
    },
    db
  );

  console.log(
    `[ARIA] Observation created: ${obsId} for event ${eventId}`
  );

  await updatePersonState(
    personId,
    orgId,
    db
  );

  console.log(
    `[ARIA] Person state updated for ${personId}`
  );

  return obsId;
    }
