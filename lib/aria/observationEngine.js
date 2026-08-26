// lib/aria/observationEngine.js
import pool from '../db';

const SEVERITY_WEIGHT = { low: 0.3, medium: 0.6, high: 0.8, critical: 1.0 };
const URGENCY_WEIGHT = { low: 0.2, medium: 0.5, high: 0.8 };

function computeAttention(confidence, severity, urgency, createdAt = new Date()) {
  const severityWeight = SEVERITY_WEIGHT[severity];
  const urgencyWeight = URGENCY_WEIGHT[urgency];

  if (!severityWeight) throw new Error(`Invalid severity: ${severity}`);
  if (!urgencyWeight) throw new Error(`Invalid urgency: ${urgency}`);

  const createdTime = new Date(createdAt).getTime();
  const hoursSince = Number.isFinite(createdTime)
    ? Math.max(0, (Date.now() - createdTime) / 3600000)
    : 0;

  let score = confidence * severityWeight * urgencyWeight * 100;

  if (hoursSince < 24) {
    score += 10 * (1 - hoursSince / 24);
  }

  return Math.min(100, Math.max(0, Math.round(score)));
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
  if (!Number.isFinite(confidence)) throw new Error('confidence must be a finite number');
  if (!severity) throw new Error('severity required');
  if (!urgency) throw new Error('urgency required');
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error('evidence must be an object');
  }

  const finalConfidence = Math.min(1, Math.max(0, confidence));

  // Prevent concurrent duplicate projections for the same source event.
  if (sourceEventId !== null && sourceEventId !== undefined) {
    await db.query(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
      [String(organizationId), String(sourceEventId)]
    );
  }

  if (sourceEventId !== null && sourceEventId !== undefined) {
    const existing = await db.query(
      `SELECT id
       FROM aria_observations
       WHERE organization_id = $1
         AND metadata->>'source_event_id' = $2
       LIMIT 1`,
      [organizationId, String(sourceEventId)]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0].id;
    }
  }

  const attentionScore = computeAttention(
    finalConfidence,
    severity,
    urgency
  );

  const metadata = sourceEventId !== null && sourceEventId !== undefined
    ? { source_event_id: String(sourceEventId) }
    : {};

  const result = await db.query(
    `INSERT INTO aria_observations (
      organization_id,
      person_id,
      type,
      confidence,
      severity,
      urgency,
      attention_score,
      evidence,
      metadata,
      detected_at,
      expires_at,
      status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, 'active')
    RETURNING id`,
    [
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
    ]
  );

  return result.rows[0].id;
}

export async function getAggregatedObservations(orgId) {
  if (!orgId) throw new Error('orgId required');

  const result = await pool.query(
    `WITH ranked AS (
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
    ORDER BY max_attention DESC`,
    [orgId]
  );

  return result.rows;
                                        }
