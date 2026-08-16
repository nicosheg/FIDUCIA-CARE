// lib/aria/predictionEngine.js
import pool from '../db';
import { getOrgSettings } from './organizationSettings';

/**
 * Update prediction scores for all active people.
 * - return_likelihood: 0–100, higher = more likely to return.
 * - inactivity_risk: 0–100, higher = more likely to become inactive.
 */
export async function updatePredictions(orgId) {
    const settings = await getOrgSettings(orgId);
    const cycleDays = settings.engagement_cycle_days;
    const threshold3 = settings.risk_threshold_3 * cycleDays;

    const peopleRes = await pool.query(
        `SELECT em.person_id, em.last_seen, em.participation_count, em.participation_rate
         FROM engagement_metrics em
         JOIN people p ON em.person_id = p.id
         WHERE em.organization_id = $1 AND p.status = 'active'`,
        [orgId]
    );

    const now = new Date();
    for (const row of peopleRes.rows) {
        const daysSinceLast = (now - new Date(row.last_seen)) / (1000 * 60 * 60 * 24);
        const inactivityWeeks = daysSinceLast / cycleDays;

        // Base values
        let returnLikelihood = 50;
        let inactivityRisk = 0;

        if (inactivityWeeks >= threshold3) {
            inactivityRisk = 90;
            returnLikelihood = 20;
        } else if (inactivityWeeks >= threshold3 * 0.5) {
            inactivityRisk = 60;
            returnLikelihood = 40;
        } else {
            inactivityRisk = 20;
            returnLikelihood = 80;
        }

        // Adjust based on participation rate
        if (row.participation_rate > 75) {
            returnLikelihood += 10;
            inactivityRisk -= 10;
        } else if (row.participation_rate < 30) {
            returnLikelihood -= 10;
            inactivityRisk += 10;
        }

        // Clamp
        returnLikelihood = Math.min(100, Math.max(0, returnLikelihood));
        inactivityRisk = Math.min(100, Math.max(0, inactivityRisk));

        // Store predictions
        await pool.query(
            `INSERT INTO prediction_scores (organization_id, person_id, prediction_type, score, model_version, updated_at)
             VALUES ($1, $2, 'return_likelihood', $3, 'v1', NOW())
             ON CONFLICT (organization_id, person_id, prediction_type) DO UPDATE SET
               score = EXCLUDED.score,
               model_version = EXCLUDED.model_version,
               updated_at = NOW()`,
            [orgId, row.person_id, returnLikelihood]
        );
        await pool.query(
            `INSERT INTO prediction_scores (organization_id, person_id, prediction_type, score, model_version, updated_at)
             VALUES ($1, $2, 'inactivity_risk', $3, 'v1', NOW())
             ON CONFLICT (organization_id, person_id, prediction_type) DO UPDATE SET
               score = EXCLUDED.score,
               model_version = EXCLUDED.model_version,
               updated_at = NOW()`,
            [orgId, row.person_id, inactivityRisk]
        );
    }
    console.log(`[Predictions] Updated for org ${orgId}`);
}

/**
 * Get predictions for a specific person.
 */
export async function getPredictionsForPerson(orgId, personId) {
    const res = await pool.query(
        `SELECT prediction_type, score, model_version, updated_at
         FROM prediction_scores
         WHERE organization_id = $1 AND person_id = $2
         ORDER BY updated_at DESC`,
        [orgId, personId]
    );
    return res.rows;
}
