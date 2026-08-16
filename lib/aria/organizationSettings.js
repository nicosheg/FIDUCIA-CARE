// lib/aria/organizationSettings.js
import pool from '../db';

/**
 * Get organization settings, with defaults if not set.
 */
export async function getOrgSettings(orgId) {
    const res = await pool.query(
        `SELECT engagement_cycle_days, risk_threshold_1, risk_threshold_2, risk_threshold_3
         FROM organization_settings
         WHERE organization_id = $1`,
        [orgId]
    );
    if (res.rows.length === 0) {
        // Default settings (weekly cycle, 1/2/4 weeks thresholds)
        return {
            engagement_cycle_days: 7,
            risk_threshold_1: 1,
            risk_threshold_2: 2,
            risk_threshold_3: 4,
        };
    }
    return res.rows[0];
}

/**
 * Upsert organization settings.
 */
export async function upsertOrgSettings(orgId, settings) {
    const { engagement_cycle_days, risk_threshold_1, risk_threshold_2, risk_threshold_3 } = settings;
    await pool.query(
        `INSERT INTO organization_settings (organization_id, engagement_cycle_days, risk_threshold_1, risk_threshold_2, risk_threshold_3)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id) DO UPDATE SET
           engagement_cycle_days = EXCLUDED.engagement_cycle_days,
           risk_threshold_1 = EXCLUDED.risk_threshold_1,
           risk_threshold_2 = EXCLUDED.risk_threshold_2,
           risk_threshold_3 = EXCLUDED.risk_threshold_3,
           updated_at = NOW()`,
        [orgId, engagement_cycle_days, risk_threshold_1, risk_threshold_2, risk_threshold_3]
    );
}
