// lib/aria/recommendationEngine.js
import pool from '../db';
import { createCareAction } from './careActions';

/**
 * Generate actionable recommendations for an organization.
 * - Urgent cases (critical risk) → follow-up recommendation (high priority)
 * - New people → welcome recommendation (medium priority)
 * - Returning people → welcome back recommendation (medium priority)
 * - At-risk people (if not urgent) → check-in recommendation (low priority)
 */
export async function generateRecommendations(orgId) {
  const client = await pool.connect();
  const created = [];

  try {
    await client.query('BEGIN');

    // 1. Urgent cases (critical risk)
    const urgentRes = await client.query(
      `SELECT ec.person_id, p.first_name, ec.inactivity_streak
       FROM engagement_cases ec
       JOIN people p ON ec.person_id = p.id
       WHERE ec.organization_id = $1
         AND ec.engagement_status = 'urgent_action_required'
         AND ec.resolved = false
       ORDER BY ec.inactivity_streak DESC`,
      [orgId]
    );
    for (const row of urgentRes.rows) {
      const text = `Follow up with ${row.first_name} (inactive for ${row.inactivity_streak} weeks)`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 2); // due in 2 days
      const res = await client.query(
        `INSERT INTO recommendations
         (organization_id, person_id, action_type, recommendation_text, priority, due_date, status)
         VALUES ($1, $2, 'follow_up', $3, 10, $4, 'pending')
         RETURNING id`,
        [orgId, row.person_id, text, dueDate.toISOString().split('T')[0]]
      );
      created.push({ id: res.rows[0].id, person_id: row.person_id, text });
    }

    // 2. New people (first_time within last 7 days)
    const newRes = await client.query(
      `SELECT em.person_id, p.first_name
       FROM engagement_metrics em
       JOIN people p ON em.person_id = p.id
       WHERE em.organization_id = $1
         AND em.engagement_status = 'first_time'
         AND em.last_seen >= NOW() - INTERVAL '7 days'
       ORDER BY em.last_seen DESC
       LIMIT 5`,
      [orgId]
    );
    for (const row of newRes.rows) {
      const text = `Welcome ${row.first_name} (new person)`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);
      const res = await client.query(
        `INSERT INTO recommendations
         (organization_id, person_id, action_type, recommendation_text, priority, due_date, status)
         VALUES ($1, $2, 'welcome', $3, 5, $4, 'pending')
         RETURNING id`,
        [orgId, row.person_id, text, dueDate.toISOString().split('T')[0]]
      );
      created.push({ id: res.rows[0].id, person_id: row.person_id, text });
    }

    // 3. Returning people (within last 7 days)
    const returnRes = await client.query(
      `SELECT em.person_id, p.first_name
       FROM engagement_metrics em
       JOIN people p ON em.person_id = p.id
       WHERE em.organization_id = $1
         AND em.engagement_status = 'returning'
         AND em.last_seen >= NOW() - INTERVAL '7 days'
       ORDER BY em.last_seen DESC
       LIMIT 5`,
      [orgId]
    );
    for (const row of returnRes.rows) {
      const text = `Welcome back ${row.first_name}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);
      const res = await client.query(
        `INSERT INTO recommendations
         (organization_id, person_id, action_type, recommendation_text, priority, due_date, status)
         VALUES ($1, $2, 'welcome_back', $3, 5, $4, 'pending')
         RETURNING id`,
        [orgId, row.person_id, text, dueDate.toISOString().split('T')[0]]
      );
      created.push({ id: res.rows[0].id, person_id: row.person_id, text });
    }

    // 4. At-risk (not urgent) – lower priority
    const atRiskRes = await client.query(
      `SELECT ec.person_id, p.first_name, ec.inactivity_streak
       FROM engagement_cases ec
       JOIN people p ON ec.person_id = p.id
       WHERE ec.organization_id = $1
         AND ec.engagement_status = 'at_risk'
         AND ec.resolved = false
       ORDER BY ec.inactivity_streak DESC
       LIMIT 10`,
      [orgId]
    );
    for (const row of atRiskRes.rows) {
      const text = `Check in with ${row.first_name} (inactive for ${row.inactivity_streak} weeks)`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 5);
      const res = await client.query(
        `INSERT INTO recommendations
         (organization_id, person_id, action_type, recommendation_text, priority, due_date, status)
         VALUES ($1, $2, 'check_in', $3, 2, $4, 'pending')
         RETURNING id`,
        [orgId, row.person_id, text, dueDate.toISOString().split('T')[0]]
      );
      created.push({ id: res.rows[0].id, person_id: row.person_id, text });
    }

    await client.query('COMMIT');
    console.log(`[RecommendationEngine] Generated ${created.length} recommendations for org ${orgId}`);
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[RecommendationEngine] Error:', err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getPendingRecommendations(orgId, limit = 20) {
  const res = await pool.query(
    `SELECT r.*, p.first_name, p.phone
     FROM recommendations r
     JOIN people p ON r.person_id = p.id
     WHERE r.organization_id = $1 AND r.status = 'pending'
     ORDER BY r.priority DESC, r.due_date ASC, r.created_at ASC
     LIMIT $2`,
    [orgId, limit]
  );
  return res.rows;
}

export async function acceptRecommendation(recId, assignedTo = null) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query(
      `UPDATE recommendations
       SET status = 'accepted', assigned_to = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING organization_id, person_id, action_type, recommendation_text, notes, due_date`,
      [assignedTo, recId]
    );
    if (res.rows.length === 0) {
      throw new Error('Recommendation not found');
    }
    const r = res.rows[0];

    // Create a care action
    const actionId = await createCareAction(
      r.organization_id,
      r.person_id,
      r.action_type,
      assignedTo,
      r.recommendation_text,
      r.due_date
    );

    // Link care action to recommendation (optional)
    await client.query(
      `UPDATE recommendations SET care_action_id = $1 WHERE id = $2`,
      [actionId, recId]
    );

    await client.query('COMMIT');
    return { success: true, actionId };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[RecommendationEngine] Accept error:', err);
    throw err;
  } finally {
    client.release();
  }
}

export async function dismissRecommendation(recId) {
  await pool.query(
    `UPDATE recommendations SET status = 'dismissed', updated_at = NOW() WHERE id = $1`,
    [recId]
  );
  return { success: true };
}

export async function completeRecommendation(recId) {
  await pool.query(
    `UPDATE recommendations SET status = 'completed', updated_at = NOW() WHERE id = $1`,
    [recId]
  );
  return { success: true };
    }
