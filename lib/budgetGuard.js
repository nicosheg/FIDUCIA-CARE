// lib/budgetGuard.js
import pool from './db';
import { calculateConservativeReservation } from './costCalculator';

function parseBudgetLimit(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`BudgetGuard: invalid budget limit "${value}"`);
  }
  return num;
}

export async function reserveBudget(organization_id, purpose, modelKey) {
  if (!organization_id || !purpose || !modelKey) {
    throw new Error('reserveBudget: organization_id, purpose, and modelKey are required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`fiducia-budget:${organization_id}:${purpose}`]
    );

    const dailyLimit = parseBudgetLimit(process.env.MAX_DAILY_AI_COST, 0.10);
    const monthlyLimit = parseBudgetLimit(process.env.MAX_MONTHLY_AI_COST, 2.00);

    const estimatedCost = calculateConservativeReservation(modelKey);
    if (typeof estimatedCost !== 'number' || !Number.isFinite(estimatedCost) || estimatedCost <= 0) {
      throw new Error(`BudgetGuard: invalid estimatedCost ${estimatedCost}`);
    }

    // ---- DAILY LEDGER ----
    const dailyRes = await client.query(
      `SELECT
         COALESCE(SUM(
           CASE
             WHEN status = 'confirmed' THEN actual_cost
             WHEN status = 'pending' THEN estimated_cost
             ELSE 0
           END
         ), 0) AS total
       FROM budget_reservations
       WHERE organization_id = $1
         AND purpose = $2
         AND (
           (status = 'confirmed' AND confirmed_at::date = CURRENT_DATE)
           OR
           (status = 'pending'
            AND expires_at > NOW()
            AND created_at::date = CURRENT_DATE)
         )`,
      [organization_id, purpose]
    );
    const dailyReservedAndSpent = Number(dailyRes.rows[0].total);
    if (!Number.isFinite(dailyReservedAndSpent) || dailyReservedAndSpent < 0) {
      throw new Error('BudgetGuard: invalid daily reservation total');
    }

    // ---- MONTHLY LEDGER ----
    const monthlyRes = await client.query(
      `SELECT
         COALESCE(SUM(
           CASE
             WHEN status = 'confirmed' THEN actual_cost
             WHEN status = 'pending' THEN estimated_cost
             ELSE 0
           END
         ), 0) AS total
       FROM budget_reservations
       WHERE organization_id = $1
         AND purpose = $2
         AND (
           (status = 'confirmed'
            AND confirmed_at >= date_trunc('month', NOW()))
           OR
           (status = 'pending'
            AND expires_at > NOW()
            AND created_at >= date_trunc('month', NOW()))
         )`,
      [organization_id, purpose]
    );
    const monthlyReservedAndSpent = Number(monthlyRes.rows[0].total);
    if (!Number.isFinite(monthlyReservedAndSpent) || monthlyReservedAndSpent < 0) {
      throw new Error('BudgetGuard: invalid monthly reservation total');
    }

    if (dailyReservedAndSpent + estimatedCost > dailyLimit) {
      await client.query('ROLLBACK');
      return { allowed: false, reason: 'Daily budget would be exceeded' };
    }
    if (monthlyReservedAndSpent + estimatedCost > monthlyLimit) {
      await client.query('ROLLBACK');
      return { allowed: false, reason: 'Monthly budget would be exceeded' };
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const reservationResult = await client.query(
      `INSERT INTO budget_reservations (
        organization_id, purpose, estimated_cost, model_key, status, expires_at
      ) VALUES ($1, $2, $3, $4, 'pending', $5)
      RETURNING id`,
      [organization_id, purpose, estimatedCost, modelKey, expiresAt]
    );
    const reservationId = reservationResult.rows[0].id;

    await client.query('COMMIT');
    return { allowed: true, reservationId, estimatedCost };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function confirmReservation(reservationId, actualCost) {
  if (!reservationId) return false;
  if (typeof actualCost !== 'number' || !Number.isFinite(actualCost) || actualCost < 0) {
    console.warn(`BudgetGuard: invalid actualCost ${actualCost}, cannot confirm`);
    return false;
  }
  const result = await pool.query(
    `UPDATE budget_reservations
     SET status = 'confirmed', actual_cost = $1, confirmed_at = NOW()
     WHERE id = $2 AND status = 'pending'
     RETURNING id`,
    [actualCost, reservationId]
  );
  return result.rowCount === 1;
}

export async function cancelReservation(reservationId) {
  if (!reservationId) return false;
  const result = await pool.query(
    `UPDATE budget_reservations
     SET status = 'cancelled', cancelled_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING id`,
    [reservationId]
  );
  return result.rowCount === 1;
}
