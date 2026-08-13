// pages/api/identity/resolve.js
import pool from '../../../lib/db';
import { normalizeName } from '../../../lib/scanValidation';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { scan_job_id, extracted_name, action, target_person_id, new_name, new_phone } = req.body;
  if (!scan_job_id || !extracted_name || !action) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Get the scan job and its organization
  const jobRes = await pool.query(
    `SELECT organization_id, result FROM scan_jobs WHERE id = $1`,
    [scan_job_id]
  );
  if (jobRes.rows.length === 0) {
    return res.status(404).json({ error: 'Scan job not found' });
  }
  const orgId = jobRes.rows[0].organization_id;
  const result = jobRes.rows[0].result;

  const needsReview = result.needs_review || [];
  const itemIndex = needsReview.findIndex(item => item.extracted_name === extracted_name);
  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Review item not found' });
  }
  const item = needsReview[itemIndex];
  if (item.resolved) {
    return res.status(400).json({ error: 'Already resolved' });
  }

  let resolvedPersonId = null;
  let resolutionAction = action;

  // Process different actions
  if (action === 'confirm') {
    if (!target_person_id) {
      return res.status(400).json({ error: 'target_person_id required for confirm' });
    }
    // Verify the person exists and belongs to the org
    const personCheck = await pool.query(
      `SELECT id, first_name FROM people WHERE id = $1 AND organization_id = $2 AND status = 'active'`,
      [target_person_id, orgId]
    );
    if (personCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Person not found in this organization' });
    }
    resolvedPersonId = target_person_id;

    // Insert alias if the name differs from the existing person's name
    const existingName = personCheck.rows[0].first_name;
    if (normalizeName(existingName) !== normalizeName(extracted_name)) {
      await pool.query(
        `INSERT INTO person_aliases (organization_id, person_id, alias, source, confidence)
         VALUES ($1, $2, $3, 'scan', $4)`,
        [orgId, target_person_id, extracted_name, item.confidence || 85]
      );
    }

  } else if (action === 'keep_new') {
    // Create a new person
    const insertRes = await pool.query(
      `INSERT INTO people (organization_id, first_name, phone, type, status, confidence, source)
       VALUES ($1, $2, $3, 'visitor', 'active', $4, 'scan')
       RETURNING id`,
      [orgId, new_name || extracted_name, new_phone || item.extracted_phone, item.confidence || 70]
    );
    resolvedPersonId = insertRes.rows[0].id;

  } else if (action === 'edit') {
    // Update the extracted data and then treat as keep_new
    const updatedName = new_name || extracted_name;
    const updatedPhone = new_phone || item.extracted_phone;
    const insertRes = await pool.query(
      `INSERT INTO people (organization_id, first_name, phone, type, status, confidence, source)
       VALUES ($1, $2, $3, 'visitor', 'active', $4, 'scan')
       RETURNING id`,
      [orgId, updatedName, updatedPhone, item.confidence || 70]
    );
    resolvedPersonId = insertRes.rows[0].id;
    resolutionAction = 'edit_keep_new';

  } else {
    return res.status(400).json({ error: `Unsupported action: ${action}` });
  }

  // Update the review item
  needsReview[itemIndex] = {
    ...item,
    resolved: true,
    resolved_person_id: resolvedPersonId,
    resolution_action: resolutionAction,
    resolved_at: new Date().toISOString(),
  };

  result.needs_review = needsReview;

  // Update scan job
  await pool.query(
    `UPDATE scan_jobs SET result = $1 WHERE id = $2`,
    [result, scan_job_id]
  );

  res.status(200).json({
    success: true,
    resolved: needsReview[itemIndex],
  });
      }
