// lib/aria/eventProcessor.js
import pool from '../db';
import { createObservation } from './observationEngine';
import { updatePersonState } from './stateManager';

export async function processAriaEvent(
  event,
  client = null
) {
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
    throw new Error(
      'ARIA event organization_id is required'
    );
  }

  if (!type) {
    throw new Error('ARIA event type is required');
  }

  if (!personId) {
    console.log(
      `[ARIA] Skipping event ${eventId} (no person_id)`
    );
    return null;
  }

  const ownsTransaction = !client;
  const db = client || (await pool.connect());

  try {
    if (ownsTransaction) {
      await db.query('BEGIN');
    }

    await db.query(
      `SELECT pg_advisory_xact_lock(
        hashtext($1),
        hashtext($2)
      )`,
      [
        String(orgId),
        String(eventId),
      ]
    );

    const existingObs = await db.query(
      `SELECT id
       FROM aria_observations
       WHERE organization_id = $1
         AND metadata->>'source_event_id' = $2
       LIMIT 1`,
      [
        orgId,
        String(eventId),
      ]
    );

    if (existingObs.rows.length > 0) {
      if (ownsTransaction) {
        await db.query('COMMIT');
      }

      console.log(
        `[ARIA] Observation already exists for event ${eventId}, skipping.`
      );

      return existingObs.rows[0].id;
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

        confidence =
          typeof metadata.confidence === 'number'
            ? Math.min(
                1,
                Math.max(
                  0,
                  metadata.confidence / 100
                )
              )
            : 0.7;

        severity = 'medium';
        urgency = 'medium';

        evidence = {
          sources: source ? [source] : [],
          facts: [
            `Created from ${source || 'unknown'}`,
            `Program: ${
              metadata.programName || 'unknown'
            }`,
          ],
          inference: 'New person discovered',
        };

        break;
      }

      case 'PERSON_UPDATED': {
        if (ownsTransaction) {
          await db.query('COMMIT');
        }

        console.log(
          `[ARIA] PERSON_UPDATED event ${eventId} recorded but not projected.`
        );

        return null;
      }

      default: {
        if (ownsTransaction) {
          await db.query('COMMIT');
        }

        console.log(
          `[ARIA] No observation mapping for event type: ${type}`
        );

        return null;
      }
    }

    if (!observationType) {
      if (ownsTransaction) {
        await db.query('COMMIT');
      }

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

    await updatePersonState(
      personId,
      orgId,
      db
    );

    if (ownsTransaction) {
      await db.query('COMMIT');
    }

    console.log(
      `[ARIA] Observation created: ${obsId} for event ${eventId}`
    );

    console.log(
      `[ARIA] Person state updated for ${personId}`
    );

    return obsId;
  } catch (err) {
    if (ownsTransaction) {
      await db.query('ROLLBACK');
    }

    console.error(
      '[ARIA] Event processing error:',
      err
    );

    throw err;
  } finally {
    if (ownsTransaction) {
      db.release();
    }
  }
        }
