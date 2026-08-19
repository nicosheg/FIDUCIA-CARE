// Add to lib/aria/engagementIntelligence.js
export async function updateEngagementMetricsForPerson(personId, orgId) {
    const client = await pool.connect();
    try {
        // Fetch participation records for this person
        const partRes = await client.query(
            `SELECT participation_date
             FROM participation_records
             WHERE person_id = $1 AND present = true AND organization_id = $2
             ORDER BY participation_date`,
            [personId, orgId]
        );
        const dates = partRes.rows.map(r => new Date(r.participation_date));
        const total = dates.length;
        const now = new Date();

        let firstSeen = null;
        let lastSeen = null;
        let participationRate = 0;
        let inactivityStreak = 0;
        let participationStreak = 0;
        let status = 'first_time';

        if (total > 0) {
            firstSeen = dates[0];
            lastSeen = dates[dates.length - 1];
            const daysSinceFirst = Math.floor((now - firstSeen) / (1000 * 60 * 60 * 24));
            const weeksSinceFirst = Math.max(1, Math.floor(daysSinceFirst / 7));
            participationRate = Math.min(100, Math.round((total / weeksSinceFirst) * 100));

            const daysSinceLast = Math.floor((now - lastSeen) / (1000 * 60 * 60 * 24));
            inactivityStreak = Math.floor(daysSinceLast / 7);
            participationStreak = inactivityStreak === 0 ? 1 : 0;

            // Classify engagement (reuse existing classifyEngagement)
            // We'll copy the logic here to avoid circular deps
            const weeksSinceLast = Math.floor(daysSinceLast / 7);
            if (weeksSinceLast < 4 && total >= 4) status = 'regular';
            else if (weeksSinceLast < 4) status = total === 1 ? 'first_time' : 'returning';
            else if (weeksSinceLast < 8) status = 'at_risk';
            else status = 'inactive';
        }

        // Upsert engagement_metrics
        await client.query(
            `INSERT INTO engagement_metrics (
                person_id, organization_id, participation_count, participation_rate,
                participation_streak, inactivity_streak, first_seen, last_seen,
                engagement_status, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (person_id) DO UPDATE SET
                participation_count = EXCLUDED.participation_count,
                participation_rate = EXCLUDED.participation_rate,
                participation_streak = EXCLUDED.participation_streak,
                inactivity_streak = EXCLUDED.inactivity_streak,
                first_seen = EXCLUDED.first_seen,
                last_seen = EXCLUDED.last_seen,
                engagement_status = EXCLUDED.engagement_status,
                updated_at = NOW()`,
            [
                personId,
                orgId,
                total,
                participationRate,
                participationStreak,
                inactivityStreak,
                firstSeen,
                lastSeen,
                status
            ]
        );

        // Also update engagement_cases (reuse existing logic or call a function)
        // We'll call updateEngagementCases(orgId) as a batch after all updates? 
        // For simplicity, we can re-run the full cases update (it's not too heavy)
        // but we'll call it outside the loop to avoid N+1.
    } catch (err) {
        console.error('Error updating metrics for person', personId, err);
        throw err;
    } finally {
        client.release();
    }
}

// Also update the existing updateEngagementMetrics to use this function in batch?
// We can keep it as-is for the full org update.
