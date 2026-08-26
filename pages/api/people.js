// pages/api/people.js
import pool from '../../lib/db';
import { normalizePhone } from '../../lib/phoneUtils';
import { withOrg } from '../../lib/apiHelpers';
import { emitAriaEvent } from '../../lib/aria/eventEmitter';
import { processAriaEvent } from '../../lib/aria/eventProcessor';

async function handler(req, res) {
  const orgId = req.org.id;

  // =========================================================
  // GET
  // =========================================================

  if (req.method === 'GET') {
    try {
      const result = await pool.query(
        `
          SELECT *
          FROM people
          WHERE organization_id = $1
          ORDER BY first_name ASC, last_name ASC
        `,
        [orgId]
      );

      return res.status(200).json(result.rows);
    } catch (err) {
      console.error(
        'GET people error:',
        err
      );

      return res.status(500).json({
        error: err.message,
      });
    }
  }

  // =========================================================
  // POST — CREATE PERSON
  // =========================================================

  if (req.method === 'POST') {
    const {
      first_name,
      last_name,
      phone,
      email,
      type,
      birthday,
    } = req.body || {};

    if (!first_name) {
      return res.status(400).json({
        error: 'first_name is required',
      });
    }

    const normalizedPhone =
      normalizePhone(phone);

    const defaultLivingTruth =
      JSON.stringify({
        status: 'alive',
        confidence: 90,
        source: 'canonical_record',
        updated_at:
          new Date().toISOString(),
      });

    try {
      const result = await pool.query(
        `
          INSERT INTO people (
            organization_id,
            first_name,
            last_name,
            phone,
            email,
            type,
            birthday,
            living_truth
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8
          )
          RETURNING *
        `,
        [
          orgId,
          first_name,
          last_name || '',
          normalizedPhone || null,
          email || '',
          type || 'visitor',
          birthday || null,
          defaultLivingTruth,
        ]
      );

      const newPerson =
        result.rows[0];

      /*
       * ARIA event projection.
       *
       * Person persistence is intentionally independent from ARIA
       * processing in Phase 5.1.
       *
       * If ARIA processing fails, the person remains successfully
       * created. The error is logged rather than changing the
       * successful person response.
       */
      try {
        const event =
          await emitAriaEvent({
            organizationId: orgId,
            personId: newPerson.id,
            type: 'PERSON_CREATED',
            source: 'manual',
            actorId: req.user.id,

            metadata: {
              source: 'api',
              user: req.user.id,
            },

            /*
             * Deterministic because the person ID is generated
             * by the successful person creation itself.
             */
            eventKey:
              `manual:${orgId}:person:${newPerson.id}:created`,
          });

        if (event) {
          await processAriaEvent(event);
        }
      } catch (err) {
        console.error(
          'ARIA event processing failed for person creation:',
          err
        );
      }

      return res.status(200).json(
        newPerson
      );
    } catch (err) {
      console.error(
        'POST person error:',
        err
      );

      return res.status(500).json({
        error: err.message,
      });
    }
  }

  // =========================================================
  // PUT — UPDATE PERSON
  // =========================================================

  if (req.method === 'PUT') {
    const {
      id,
      first_name,
      last_name,
      phone,
      type,
      birthday,
    } = req.body || {};

    if (!id) {
      return res.status(400).json({
        error: 'id is required',
      });
    }

    const normalizedPhone =
      normalizePhone(phone);

    try {
      /*
       * First verify that the person belongs to this organization.
       */
      const check = await pool.query(
        `
          SELECT id
          FROM people
          WHERE id = $1
            AND organization_id = $2
        `,
        [id, orgId]
      );

      if (check.rows.length === 0) {
        return res.status(404).json({
          error:
            'Person not found in this organization',
        });
      }

      const updates = [];
      const values = [];

      let paramCount = 1;

      if (first_name !== undefined) {
        updates.push(
          `first_name = $${paramCount++}`
        );

        values.push(first_name);
      }

      if (last_name !== undefined) {
        updates.push(
          `last_name = $${paramCount++}`
        );

        values.push(last_name);
      }

      if (phone !== undefined) {
        updates.push(
          `phone = $${paramCount++}`
        );

        values.push(
          normalizedPhone || null
        );
      }

      if (type !== undefined) {
        updates.push(
          `type = $${paramCount++}`
        );

        values.push(
          type || 'visitor'
        );
      }

      if (birthday !== undefined) {
        updates.push(
          `birthday = $${paramCount++}`
        );

        values.push(
          birthday || null
        );
      }

      if (updates.length === 0) {
        return res.status(400).json({
          error: 'No fields to update',
        });
      }

      updates.push(
        'updated_at = NOW()'
      );

      /*
       * id and organization_id are deliberately appended after
       * all dynamic update values.
       */
      values.push(id, orgId);

      const query = `
        UPDATE people
        SET ${updates.join(', ')}
        WHERE id = $${paramCount}
          AND organization_id = $${paramCount + 1}
        RETURNING *
      `;

      const result =
        await pool.query(
          query,
          values
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Person not found',
        });
      }

      /*
       * PERSON_UPDATED is intentionally event-only in Phase 5.1.
       *
       * It does NOT call processAriaEvent().
       *
       * Timestamp-based event key is acceptable because this event
       * currently has no observation projection.
       */
      try {
        await emitAriaEvent({
          organizationId: orgId,
          personId: id,
          type: 'PERSON_UPDATED',
          source: 'manual',
          actorId: req.user.id,

          metadata: {
            updated_fields:
              Object.keys(req.body).filter(
                (key) => key !== 'id'
              ),
          },

          eventKey:
            `manual:${orgId}:person:${id}:update:${Date.now()}`,
        });
      } catch (err) {
        console.error(
          'ARIA event emission failed for person update:',
          err
        );
      }

      return res.status(200).json(
        result.rows[0]
      );
    } catch (err) {
      console.error(
        'PUT person error:',
        err
      );

      return res.status(500).json({
        error: err.message,
      });
    }
  }

  // =========================================================
  // Unsupported method
  // =========================================================

  return res
    .status(405)
    .json({
      error: 'Method not allowed',
    });
}

export default withOrg(handler);
