// lib/aria/eventProcessor.js
import pool from '../db';
import { createObservation } from './observationEngine';
import { updatePersonState } from './stateManager';

export async function processAriaEvent(event, client = null) {
  const db = client || pool;
  const { id: eventId, organization_id: orgId, person_id: personId, type, source, metadata } = event;

  if (!personId) {
    console.log(`[ARIA] Skipping event ${eventId} (no person_id)`);
    return;
  }

  // Check if an observation already exists for this event (idempotency)
  const existingObs = await db.query(
    `SELECT id FROM aria_observations WHERE (metadata->>'source_event_id')::UUID = $1`,
    [eventId]
  );
  if (existingObs.rows.length > 0) {
    console.log(`[ARIA] Observation already exists for event ${eventId}, skipping.`);
    return;
  }

  let observationType = null;
  let confidence = 0.7; // default
  let severity = 'medium';
  let urgency = 'medium';
  let evidence = { sources: [source], facts: [], inference: '' };

  switch (type) {
    case 'PERSON_CREATED':
      observationType = 'NEW_PERSON';
      // Use confidence from metadata if available, otherwise default 0.7
      confidence = metadata?.confidence ? metadata.confidence / 100 : 0.7;
      severity = 'medium';
      urgency = 'medium';
      evidence = {
        sources: [source],
        facts: [`Created from ${source}`, `Program: ${metadata?.programName || 'unknown'}`],
        inference: 'New person discovered',
      };
      break;
    case 'PERSON_UPDATED':
      observationType = 'PERSON_UPDATED';
      confidence = 0.5;
      severity = 'low';
      urgency = 'low';
      evidence = {
        sources: [source],
        facts: ['Person details changed'],
        inference: 'Record updated',
      };
      break;
    default:
      console.log(`[ARIA] No observation mapping for event type: ${type}`);
      return;
  }

  if (!observationType) return;

  const obsId = await createObservation({
    organizationId: orgId,
    personId: personId,
    type: observationType,
    confidence: confidence,
    severity: severity,
    urgency: urgency,
    evidence: evidence,
    expiresAt: null,
    sourceEventId: eventId,
  }, db);

  console.log(`[ARIA] Observation created: ${obsId} for event ${eventId}`);

  await updatePersonState(personId, orgId, db);
  console.log(`[ARIA] Person state updated for ${personId}`);
        }
