// pages/api/identity/resolve.js
import pool from '../../../lib/db';
import { withAdmin } from '../../../lib/apiHelpers';
import { normalizeName } from '../../../lib/scanValidation';

async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const {
        scan_job_id,
        extracted_name,
        action,
        target_person_id,
        new_name,
        new_phone,
    } = req.body;

    if (!scan_job_id || !extracted_name || !action) {
        return res.status(400).json({
            error: 'Missing required fields',
        });
    }

    const orgId = req.org.id;

    // The scan job must belong to the authenticated organization.
    const jobRes = await pool.query(
        `SELECT organization_id, result
         FROM scan_jobs
         WHERE id = $1
           AND organization_id = $2`,
        [scan_job_id, orgId]
    );

    if (jobRes.rows.length === 0) {
        return res.status(404).json({
            error: 'Scan job not found',
        });
    }

    const result = jobRes.rows[0].result || {};
    const needsReview = Array.isArray(result.needs_review)
        ? result.needs_review
        : [];

    const itemIndex = needsReview.findIndex(
        item => item.extracted_name === extracted_name
    );

    if (itemIndex === -1) {
        return res.status(404).json({
            error: 'Review item not found',
        });
    }

    const item = needsReview[itemIndex];

    if (item.resolved) {
        return res.status(400).json({
            error: 'Already resolved',
        });
    }

    let resolvedPersonId = null;
    let resolutionAction = action;

    if (action === 'confirm') {
        if (!target_person_id) {
            return res.status(400).json({
                error: 'target_person_id required for confirm',
            });
        }

        // Confirmation may only target an active person in this organization.
        const personCheck = await pool.query(
            `SELECT id, first_name
             FROM people
             WHERE id = $1
               AND organization_id = $2
               AND status = 'active'`,
            [target_person_id, orgId]
        );

        if (personCheck.rows.length === 0) {
            return res.status(404).json({
                error: 'Person not found',
            });
        }

        resolvedPersonId = target_person_id;

        /*
         * A human-confirmed alternate spelling/name becomes an alias.
         * This improves future identity matching without changing the
         * canonical person's name.
         */
        const existingName = personCheck.rows[0].first_name;

        if (
            normalizeName(existingName) !==
            normalizeName(extracted_name)
        ) {
            await pool.query(
                `INSERT INTO person_aliases
                 (
                    organization_id,
                    person_id,
                    alias,
                    source,
                    confidence
                 )
                 VALUES ($1,$2,$3,'human_confirmed',$4)`,
                [
                    orgId,
                    target_person_id,
                    extracted_name,
                    item.confidence || 85,
                ]
            );
        }

        // Human confirmation clears the pending identity uncertainty.
        await pool.query(
            `UPDATE people
             SET living_truth = NULL
             WHERE id = $1
               AND organization_id = $2`,
            [target_person_id, orgId]
        );
    } else if (action === 'keep_new') {
        // Create a genuinely new person from the reviewed scan item.
        const insertRes = await pool.query(
            `INSERT INTO people
             (
                organization_id,
                first_name,
                phone,
                type,
                status,
                confidence,
                source
             )
             VALUES ($1,$2,$3,'visitor','active',$4,'scan')
             RETURNING id`,
            [
                orgId,
                new_name || extracted_name,
                new_phone || item.extracted_phone,
                item.confidence || 70,
            ]
        );

        resolvedPersonId = insertRes.rows[0].id;
    } else if (action === 'edit') {
        // Edited scan data is explicitly accepted as a new identity.
        const updatedName = new_name || extracted_name;
        const updatedPhone =
            new_phone || item.extracted_phone;

        const insertRes = await pool.query(
            `INSERT INTO people
             (
                organization_id,
                first_name,
                phone,
                type,
                status,
                confidence,
                source
             )
             VALUES ($1,$2,$3,'visitor','active',$4,'scan')
             RETURNING id`,
            [
                orgId,
                updatedName,
                updatedPhone,
                item.confidence || 70,
            ]
        );

        resolvedPersonId = insertRes.rows[0].id;
        resolutionAction = 'edit_keep_new';
    } else {
        return res.status(400).json({
            error: `Unsupported action: ${action}`,
        });
    }

    // Persist the resolution on the originating scan job.
    needsReview[itemIndex] = {
        ...item,
        resolved: true,
        resolved_person_id: resolvedPersonId,
        resolution_action: resolutionAction,
        resolved_at: new Date().toISOString(),
    };

    result.needs_review = needsReview;

    await pool.query(
        `UPDATE scan_jobs
         SET result = $1
         WHERE id = $2
           AND organization_id = $3`,
        [result, scan_job_id, orgId]
    );

    return res.status(200).json({
        success: true,
        resolved: needsReview[itemIndex],
    });
}

export default withAdmin(handler);
