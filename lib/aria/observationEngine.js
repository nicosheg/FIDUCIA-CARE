// lib/aria/observationEngine.js
import pool from '../db';
import { normalizeConfidence } from '../confidenceUtils';

/**
 * Create a structured observation.
 * - evidence must be an object with { sources, facts, inference }
 * - Pass a db client for transaction participation.
 * - sourceEventId ensures idempotency.
 */
export async function createObservation({
  organizationId,
  personId = null,
  type,
  confidence,
  severity,
  urgency,
  evidence,
  expiresAt = null,
  sourceEventId = null,
}, client = null) {
  const db = client || pool;
  if (!organizationId) throw new Error('organizationId required');
  if (!type) throw new Error('type required');
  if (confidence === undefined || confidence === null) throw new Error('confidence required');
  if (!severity) throw new Error('severity required');
  if (!urgency) throw new Error('urgency required');
  if (!evidence || typeof evidence !== 'object') throw new Error('evidence must be an object');

  // Clamp confidence to 0-1 (not 0-100)
  const finalConfidence = Math.min(1, Math.max(0, confidence));

  const severityWeight = { low: 0.3, medium: 0.6, high: 0.8, critical: 1.0 }[severity] || 0.5;
  const urgencyWeight = { low: 0.2, medium: 0.5, high: 0.8 }[urgency] || 0.4;
  const baseScore = finalConfidence * 100 * severityWeight * urgencyWeight;
  const attentionScore = Math.min(100, Math.round(baseScore));

  // Build metadata to include source_event_id for deduplication
  const metadata = { source_event_id: sourceEventId };

  const query = `
    INSERT INTO aria_observations (
      organization_id, person_id, type, confidence, severity, urgency,
      attention_score, evidence, metadata, detected_at, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
    RETURNING id
  `;
  const values = [
    organizationId,
    personId,
    type,
    finalConfidence,    // now 0-1
    severity,
    urgency,
    attentionScore,
    evidence,
    metadata,
    expiresAt || null,
  ];
  const result = await db.query(query, values);
  return result.rows[0].id;
}
