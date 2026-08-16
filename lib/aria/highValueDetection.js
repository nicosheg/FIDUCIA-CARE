// lib/aria/highValueDetection.js
import pool from '../db';

export async function detectHighValuePersons(orgId) {
    const client = await pool.connect();
    try {
        // Get people with high engagement, positive outcomes, leadership indicators
        const peopleRes = await client.query(
            `SELECT p.id, p.first_name, rs.score, em.participation_count
             FROM people p
             LEFT JOIN relationship_scores rs ON p.id = rs.person_id
             LEFT JOIN engagement_metrics em ON p.id = em.person_id
             WHERE p.organization_id = $1 AND p.status = 'active'
               AND (rs.score > 80 OR em.participation_count > 20)`,
            [orgId]
        );

        for (const row of peopleRes.rows) {
            const valueTypes = [];
            const evidence = {};

            // Potential leader: high score + consistent
            if (row.score > 85 && row.participation_count > 15) {
                valueTypes.push({ type: 'potential_leader', score: 90 });
            }

            // Potential volunteer: high participation
            if (row.participation_count > 10) {
                valueTypes.push({ type: 'potential_volunteer', score: 85 });
            }

            // Potential donor: high score + long history
            // We'll use engagement duration as proxy
            // (future: add financial data)
            const historyRes = await client.query(
                `SELECT COUNT(*) FROM engagement_metrics WHERE person_id = $1 AND first_seen < NOW() - INTERVAL '6 months'`,
                [row.id]
            );
            if (parseInt(historyRes.rows[0].count) > 0 && row.score > 80) {
                valueTypes.push({ type: 'potential_donor', score: 80 });
            }

            // Potential mentor: high score + returning pattern
            if (row.score > 80 && row.participation_count > 20) {
                valueTypes.push({ type: 'potential_mentor', score: 85 });
            }

            // Potential staff: combination of multiple types
            if (valueTypes.length >= 2) {
                valueTypes.push({ type: 'potential_staff', score: 90 });
            }

            for (const vt of valueTypes) {
                await client.query(
                    `INSERT INTO high_value_persons (organization_id, person_id, value_type, score, evidence, updated_at)
                     VALUES ($1, $2, $3, $4, $5, NOW())
                     ON CONFLICT (organization_id, person_id, value_type) DO UPDATE SET
                       score = EXCLUDED.score,
                       evidence = EXCLUDED.evidence,
                       updated_at = NOW()`,
                    [orgId, row.id, vt.type, vt.score, JSON.stringify(evidence)]
                );
            }
        }
    } catch (err) {
        console.error('[HighValueDetection] Error:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function getHighValuePersons(orgId, valueType = null) {
    let query = `SELECT * FROM high_value_persons WHERE organization_id = $1`;
    const params = [orgId];
    if (valueType) {
        query += ` AND value_type = $2`;
        params.push(valueType);
    }
    query += ` ORDER BY score DESC`;
    const res = await pool.query(query, params);
    return res.rows;
                }
