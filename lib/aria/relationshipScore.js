// lib/aria/relationshipScore.js
import pool from '../db';

export async function computeRelationshipScore(orgId) {
    const client = await pool.connect();
    try {
        const peopleRes = await client.query(
            `SELECT p.id, em.participation_count, em.participation_rate, em.participation_streak, em.inactivity_streak
             FROM people p
             LEFT JOIN engagement_metrics em ON p.id = em.person_id
             WHERE p.organization_id = $1 AND p.status = 'active'`,
            [orgId]
        );

        for (const row of peopleRes.rows) {
            let score = 50; // baseline
            const factors = {};

            // Participation rate (max 30)
            const rateScore = Math.min(30, (row.participation_rate || 0) * 0.3);
            score += rateScore;
            factors.participation_rate = rateScore;

            // Participation streak (max 20)
            const streakScore = Math.min(20, (row.participation_streak || 0) * 5);
            score += streakScore;
            factors.participation_streak = streakScore;

            // Inactivity streak penalty (max -20)
            const penalty = Math.min(20, (row.inactivity_streak || 0) * 4);
            score -= penalty;
            factors.inactivity_streak = -penalty;

            // Count of care actions (max 10)
            const actionCount = await client.query(
                `SELECT COUNT(*) FROM care_actions WHERE person_id = $1 AND status = 'completed'`,
                [row.id]
            );
            const actionScore = Math.min(10, parseInt(actionCount.rows[0].count) * 2);
            score += actionScore;
            factors.care_actions = actionScore;

            // Outcome bonus (max 10)
            const outcomeRes = await client.query(
                `SELECT COUNT(*) FROM engagement_outcomes WHERE person_id = $1 AND outcome_type IN ('returned','became_regular')`,
                [row.id]
            );
            const outcomeBonus = Math.min(10, parseInt(outcomeRes.rows[0].count) * 3);
            score += outcomeBonus;
            factors.positive_outcomes = outcomeBonus;

            const finalScore = Math.min(100, Math.max(0, Math.round(score)));

            await client.query(
                `INSERT INTO relationship_scores (person_id, organization_id, score, factors, updated_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 ON CONFLICT (person_id) DO UPDATE SET
                   score = EXCLUDED.score,
                   factors = EXCLUDED.factors,
                   updated_at = NOW()`,
                [row.id, orgId, finalScore, JSON.stringify(factors)]
            );
        }
    } catch (err) {
        console.error('[RelationshipScore] Error:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function getTopRelationships(orgId, limit = 10) {
    const res = await pool.query(
        `SELECT rs.person_id, rs.score, p.first_name, p.phone
         FROM relationship_scores rs
         JOIN people p ON rs.person_id = p.id
         WHERE rs.organization_id = $1
         ORDER BY rs.score DESC
         LIMIT $2`,
        [orgId, limit]
    );
    return res.rows;
  }
