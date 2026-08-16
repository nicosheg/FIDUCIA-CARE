// lib/aria/brainFeed.js
import pool from '../db';
import { getPendingRecommendations } from './recommendationEngine';
import { getOrgSettings } from './organizationSettings';

export async function generateBrainFeed(orgId) {
    const client = await pool.connect();
    const entries = [];

    try {
        // 1. Warnings: high-risk cases
        const highRisk = await client.query(
            `SELECT p.id, p.first_name, ec.inactivity_streak
             FROM engagement_cases ec
             JOIN people p ON ec.person_id = p.id
             WHERE ec.organization_id = $1 AND ec.engagement_status = 'urgent_action_required' AND ec.resolved = false
             ORDER BY ec.inactivity_streak DESC`,
            [orgId]
        );
        highRisk.rows.forEach(row => {
            entries.push({
                feed_type: 'warning',
                title: `${row.first_name} needs urgent attention`,
                description: `Inactive for ${row.inactivity_streak} weeks.`,
                priority: 2,
                person_id: row.id,
            });
        });

        // 2. Wins: returning members
        const returning = await client.query(
            `SELECT p.id, p.first_name
             FROM engagement_metrics em
             JOIN people p ON em.person_id = p.id
             WHERE em.organization_id = $1 AND em.engagement_status = 'returning' AND em.last_seen >= NOW() - INTERVAL '7 days'
             ORDER BY em.last_seen DESC LIMIT 5`,
            [orgId]
        );
        returning.rows.forEach(row => {
            entries.push({
                feed_type: 'win',
                title: `Welcome back ${row.first_name}`,
                description: 'Returned after absence.',
                priority: 1,
                person_id: row.id,
            });
        });

        // 3. Opportunities: new people
        const newPeople = await client.query(
            `SELECT p.id, p.first_name
             FROM engagement_metrics em
             JOIN people p ON em.person_id = p.id
             WHERE em.organization_id = $1 AND em.engagement_status = 'first_time' AND em.last_seen >= NOW() - INTERVAL '7 days'
             ORDER BY em.last_seen DESC LIMIT 5`,
            [orgId]
        );
        newPeople.rows.forEach(row => {
            entries.push({
                feed_type: 'opportunity',
                title: `Welcome ${row.first_name}`,
                description: 'New person, first participation.',
                priority: 1,
                person_id: row.id,
            });
        });

        // 4. Insights: trend changes (could be fetched from insights engine)
        const insights = await client.query(
            `SELECT * FROM organization_memory
             WHERE organization_id = $1 AND memory_type = 'trend_insight'
             ORDER BY created_at DESC LIMIT 3`,
            [orgId]
        );
        insights.rows.forEach(row => {
            entries.push({
                feed_type: 'insight',
                title: row.memory_key,
                description: row.memory_value?.summary || '',
                priority: 0,
                person_id: null,
            });
        });

        // Store entries
        for (const entry of entries) {
            await client.query(
                `INSERT INTO aria_brain_feed (organization_id, feed_type, title, description, priority, person_id)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [orgId, entry.feed_type, entry.title, entry.description, entry.priority, entry.person_id]
            );
        }

        await client.query('COMMIT');
        return entries;
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[BrainFeed] Error:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function getBrainFeed(orgId, limit = 20) {
    const res = await pool.query(
        `SELECT * FROM aria_brain_feed
         WHERE organization_id = $1 AND is_read = false
         ORDER BY priority DESC, created_at DESC
         LIMIT $2`,
        [orgId, limit]
    );
    return res.rows;
}

export async function markFeedRead(orgId, feedId) {
    await pool.query(
        `UPDATE aria_brain_feed SET is_read = true WHERE id = $1 AND organization_id = $2`,
        [feedId, orgId]
    );
}
