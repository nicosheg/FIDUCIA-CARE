// lib/aria/observationEngine.js
import pool from '../db';

/**
 * Compute attention score based on confidence, severity, urgency, and recency.
 * Returns a score between 0 and 100.
 */
function computeAttention(confidence, severity, urgency, createdAt = new Date()) {
  const severityWeight = { low: 0.3, medium: 0.6, high: 0.8, critical: 1.0 }[severity] || 0.5;
  const urgencyWeight = { low: 0.2, medium: 0.5, high: 0.8 }[urgency] || 0.4;
  
  let score = confidence * severityWeight * urgencyWeight * 100;
  
  const hoursSince = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  if (hoursSince < 24) {
    score += 10 * (1 - hoursSince / 24);
  }
  
  return Math.min(100, Math.round(score));
}

/**
 * Create a structured observation with dynamic attention.
 * Explicitly sets status = 'active'.
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

  const finalConfidence = Math.min(1, Math.max(0, confidence));
  const attentionScore = computeAttention(finalConfidence, severity, urgency);
  const metadata = { source_event_id: sourceEventId };

  const query = `
    INSERT INTO aria_observations (
      organization_id, person_id, type, confidence, severity, urgency,
      attention_score, evidence, metadata, detected_at, expires_at, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, 'active')
    RETURNING id
  `;
  const values = [
    organizationId,
    personId,
    type,
    finalConfidence,
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

/**
 * Get aggregated observations for an organization.
 */
export async function getAggregatedObservations(orgId) {
  const db = pool;
  const result = await db.query(
    `SELECT 
       type,
       COUNT(*) as count,
       AVG(attention_score) as avg_attention,
       MAX(attention_score) as max_attention,
       MIN(attention_score) as min_attention,
       json_agg(json_build_object('id', id, 'person_id', person_id, 'confidence', confidence, 'attention_score', attention_score, 'evidence', evidence, 'created_at', detected_at) ORDER BY attention_score DESC LIMIT 5) as top_observations
     FROM aria_observations
     WHERE organization_id = $1 AND status = 'active'
     GROUP BY type
     ORDER BY max_attention DESC`,
    [orgId]
  );
  return result.rows;
}
