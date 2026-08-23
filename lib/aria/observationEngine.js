// lib/aria/observationEngine.js
import pool from '../db';
import { normalizeConfidence } from '../confidenceUtils';

/**
 * Create a structured observation.
 * - evidence must be an object with { sources, facts, inference }
 */
export async function createObservation({
  organizationId,
  personId = null,
  type,
  confidence,
  severity,    // 'low', 'medium', 'high', 'critical'
  urgency,     // 'low', 'medium', 'high'
  evidence,
  expiresAt = null,
}) {
  if (!organizationId) throw new Error('organizationId required');
  if (!type) throw new Error('type required');
  if (confidence === undefined || confidence === null) throw new Error('confidence required');
  if (!severity) throw new Error('severity required');
  if (!urgency) throw new Error('urgency required');
  if (!evidence || typeof evidence !== 'object') throw new Error('evidence must be an object');

  // Compute attention_score using a simple formula (will be enhanced later)
  const severityWeight = { low: 0.3, medium: 0.6, high: 0.8, critical: 1.0 }[severity] || 0.5;
  const urgencyWeight = { low: 0.2, medium: 0.5, high: 0.8 }[urgency] || 0.4;
  const baseScore = confidence * 100 * severityWeight * urgencyWeight;
  const attentionScore = Math.min(100, Math.round(baseScore));

  const query = `
    INSERT INTO aria_observations (
      organization_id, person_id, type, confidence, severity, urgency,
      attention_score, evidence, detected_at, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
    RETURNING id
  `;
  const values = [
    organizationId,
    personId,
    type,
    normalizeConfidence(confidence, 70), // clamp 0-1
    severity,
    urgency,
    attentionScore,
    evidence,
    expiresAt || null,
  ];
  const result = await pool.query(query, values);
  return result.rows[0].id;
}
