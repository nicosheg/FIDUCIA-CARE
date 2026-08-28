// pages/api/scan/status.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

/**
 * Return the current state of a scan job.
 * A job is only visible to its owning organization.
 */
async function handler(req, res) {
  const jobId = req.query.job_id;

  if (!jobId) {
    return res.status(400).json({ error: 'Missing job_id' });
  }

  const orgId = req.org.id;

  try {
    const jobRes = await pool.query(
      `SELECT
         id,
         status,
         progress,
         result,
         attempt_count,
         retry_count,
         started_at,
         last_progress_at,
         heartbeat,
         duration_ms,
         provider_used,
         completed_at
       FROM scan_jobs
       WHERE id = $1
         AND organization_id = $2
       LIMIT 1`,
      [jobId, orgId]
    );

    if (jobRes.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = jobRes.rows[0];

    function safeParseResult(result) {
      if (result === null || result === undefined) return null;
      if (typeof result === 'object') return result;

      if (typeof result === 'string') {
        try {
          return JSON.parse(result);
        } catch {
          return { raw: result };
        }
      }

      return { raw: result };
    }

    const resultObj = safeParseResult(job.result);

    let elapsed = 0;

    if (job.started_at) {
      const startMs = new Date(job.started_at).getTime();

      if (job.duration_ms !== null && job.duration_ms !== undefined) {
        elapsed = Math.max(0, Math.round(job.duration_ms / 1000));
      } else if (Number.isFinite(startMs)) {
        elapsed = Math.max(
          0,
          Math.round((Date.now() - startMs) / 1000)
        );
      }
    }

    let message = '';
    let error = null;

    const state = job.status;
    const progress = job.progress;

    if (state === 'pending') {
      message = 'ARIA is preparing to read the register…';
    } else if (
      state === 'processing' &&
      progress === 'enhancing'
    ) {
      message = 'ARIA is enhancing the image clarity…';
    } else if (
      state === 'processing' &&
      progress === 'reading_handwriting'
    ) {
      message = 'ARIA is reading the handwriting…';
    } else if (
      state === 'processing' &&
      progress === 'validating'
    ) {
      message = 'ARIA is validating the extracted data…';
    } else if (
      state === 'processing' &&
      progress === 'matching_community'
    ) {
      message = 'ARIA is comparing with your community…';
    } else if (
      state === 'processing' &&
      progress === 'building_memory'
    ) {
      message = 'ARIA is saving the verified records…';
    } else if (state === 'retrying') {
      message =
        resultObj?.message ||
        'ARIA is taking a little longer than usual…';
    } else if (state === 'complete') {
      message = 'Scan complete.';
    } else if (state === 'failed') {
      if (resultObj?.error) {
        const err = resultObj.error;

        message =
          err.userMessage ||
          'ARIA could not complete this scan safely.';

        error = {
          code: err.code || 'UNKNOWN_ERROR',
          stage: err.stage || 'unknown',
          details: err.details || null,
        };

        console.error(
          `Scan ${jobId} failed: stage=${err.stage}, code=${err.code}, techMsg=${err.message}`
        );
      } else {
        message =
          resultObj?.error ||
          'ARIA could not read the register. Please try again with a clearer photo.';

        if (/rate limit/i.test(message)) {
          message =
            'ARIA is very busy right now. Please try again in a few minutes.';
        }
      }
    }

    if (
      state === 'processing' &&
      elapsed > 180
    ) {
      message =
        'This scan appears to have stalled. Your existing data is safe. You can try again.';
    } else if (
      state === 'processing' &&
      elapsed > 90
    ) {
      message =
        'This is taking longer than usual. ARIA is still working…';
    }

    // Keep compatibility with schemas that expose retry_count,
    // while preferring the processor's attempt_count.
    const attempts =
      job.attempt_count ??
      job.retry_count ??
      0;

    return res.status(200).json({
      status: job.status,
      progress: job.progress,
      message,
      retry_count: attempts,
      attempt_count: attempts,
      elapsed_seconds: elapsed,
      provider: job.provider_used,
      result:
        state === 'complete'
          ? resultObj
          : null,
      error:
        state === 'failed'
          ? error
          : null,
    });
  } catch (err) {
    console.error('Status error:', err);

    return res.status(500).json({
      error: 'ARIA is having trouble. Please try again.',
    });
  }
}

export default withOrg(handler);
