// lib/aria/observationEngine.js (excerpt – only the relevant part)
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
  // ... validation ...

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
