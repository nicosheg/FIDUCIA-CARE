// lib/aria/churnPrediction.js
import pool from '../db';
import { getOrgSettings } from './organizationSettings';

export async function updateChurnPredictions(orgId) {
    const settings = await getOrgSettings(orgId);
    const cycleDays = settings.engagement_cycle_days;
    const threshold3 = settings.risk_threshold_3 * cycleDays;

    const peopleRes = await pool.query(
        `SELECT em.person_id, em.last_seen, em.participation_rate, em.inactivity_streak
         FROM engagement_metrics em
         JOIN people p ON em.person_id = p.id
         WHERE em.organization_id = $1 AND p.status = 'active'`,
        [orgId]
    );

    const now = new Date();
    for (const row of peopleRes.rows) {
        const daysSinceLast = (now - new Date(row.last_seen)) / (1000 * 60 * 60 * 24);
        const inactivityWeeks = daysSinceLast / cycleDays;

        let churnLikelihood = 0;
        let churnInDays = 30; // default

        if (inactivityWeeks >= threshold3) {
            churnLikelihood = 95;
            churnInDays = 7;
        } else if (inactivityWeeks >= threshold3 * 0.7) {
            churnLikelihood = 80;
            churnInDays = 14;
        } else if (inactivityWeeks >= threshold3 * 0.5) {
            churnLikelihood = 60;
            churnInDays = 30;
        } else if (inactivityWeeks >= threshold3 * 0.3) {
            churnLikelihood = 40;
            churnInDays = 60;
        } else {
            churnLikelihood = 20;
            churnInDays = 90;
        }

        // Adjust with participation rate
        if (row.participation_rate > 70) {
            churnLikelihood = Math.max(0, churnLikelihood - 20);
        } else if (row.participation_rate < 30) {
            churnLikelihood = Math.min(100, churnLikelihood + 20);
        }

        await pool.query(
            `INSERT INTO churn_predictions (organization_id, person_id, churn_likelihood, churn_probability_in_days, factors, model_version, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'v1', NOW())
             ON CONFLICT (organization_id, person_id) DO UPDATE SET
               churn_likelihood = EXCLUDED.churn_likelihood,
               churn_probability_in_days = EXCLUDED.churn_probability_in_days,
               factors = EXCLUDED.factors,
               model_version = EXCLUDED.model_version,
               updated_at = NOW()`,
            [
                orgId,
                row.person_id,
                Math.min(100, Math.max(0, churnLikelihood)),
                churnInDays,
                JSON.stringify({ inactivityWeeks, participationRate: row.participation_rate })
            ]
        );
    }
}

export async function getChurnRisk(orgId, threshold = 70, limit = 20) {
    const res = await pool.query(
        `SELECT cp.*, p.first_name, p.phone
         FROM churn_predictions cp
         JOIN people p ON cp.person_id = p.id
         WHERE cp.organization_id = $1 AND cp.churn_likelihood >= $2
         ORDER BY cp.churn_likelihood DESC
         LIMIT $3`,
        [orgId, threshold, limit]
    );
    return res.rows;
}
