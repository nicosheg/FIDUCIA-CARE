// lib/aria/observationEngine.js
import pool from '../db';

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
 * Uses CTE with ROW_NUMBER to get top 5 per type.
 */
export async function getAggregatedObservations(orgId) {
  if (!orgId) throw new Error('orgId required');

  const result = await pool.query(
    `
    WITH ranked AS (
      SELECT
        id,
        person_id,
        type,
        confidence,
        attention_score,
        evidence,
        detected_at,
        ROW_NUMBER() OVER (
          PARTITION BY type
          ORDER BY attention_score DESC, detected_at DESC
        ) AS rn
      FROM aria_observations
      WHERE organization_id = $1
        AND status = 'active'
    )
    SELECT
      type,
      COUNT(*) AS count,
      ROUND(AVG(attention_score)) AS avg_attention,
      MAX(attention_score) AS max_attention,
      MIN(attention_score) AS min_attention,
      COALESCE(
        json_agg(
          json_build_object(
            'id', id,
            'person_id', person_id,
            'confidence', confidence,
            'attention_score', attention_score,
            'evidence', evidence,
            'created_at', detected_at
          )
          ORDER BY attention_score DESC, detected_at DESC
        ) FILTER (WHERE rn <= 5),
        '[]'::json
      ) AS top_observations
    FROM ranked
    GROUP BY type
    ORDER BY max_attention DESC
    `,
    [orgId]
  );

  return result.rows;
  }
