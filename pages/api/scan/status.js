// pages/api/scan/status.js – Safe parsing of scan_jobs.result

import pool from '../../../lib/db';
import { INTERNAL_STATES, ariaMessageForState } from '../../../lib/scanState';

function safeParseResult(result) {
  if (result === null || result === undefined) return null;
  if (typeof result === 'object') return result; // already parsed
  if (typeof result === 'string') {
    try { return JSON.parse(result); } catch { return { raw: result }; }
  }
  return { raw: result };
}

export default async function handler(req, res) {
  const jobId = req.query.job_id;
  if (!jobId) return res.status(400).json({ error: 'Missing job_id' });

  try {
    const jobRes = await pool.query(
      `SELECT status, progress, result, retry_count, started_at, last_progress_at, heartbeat, duration_ms, provider_used
       FROM scan_jobs WHERE id = $1`,
      [jobId]
    );
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const job = jobRes.rows[0];
    const resultObj = safeParseResult(job.result);

    // Compute elapsed time
    let elapsed = 0;
    if (job.started_at) {
      elapsed = Math.round((Date.now() - new Date(job.started_at).getTime()) / 1000);
    }

    // Map to internal state
    let state = job.status; // pending, processing, retrying, complete, failed
    if (state === 'processing' && job.progress === 'enhancing') state = 'analysing';
    else if (state === 'processing' && job.progress === 'reading_handwriting') state = 'extracting';
    else if (state === 'processing' && job.progress === 'matching_community') state = 'matching';
    else if (state === 'processing' && job.progress === 'building_memory') state = 'saving';
    else if (state === 'complete') state = 'completed';
    else if (state === 'retrying') state = 'retrying';
    else if (state === 'failed') state = 'failed';

    // Build user message
    let message = ariaMessageForState(state, job.progress, elapsed);

    // If job has been stuck for > 90 seconds without progress, suggest staleness
    if (state === 'processing' && elapsed > 90) {
      message = 'This is taking longer than usual. ARIA is still working…';
    }
    if (state === 'processing' && elapsed > 180) {
      message = 'This scan appears to have stalled. Your existing data is safe. You can try again.';
    }

    // Return sanitized response
    res.status(200).json({
      status: job.status,
      progress: job.progress,
      message,
      retry_count: job.retry_count || 0,
      elapsed_seconds: elapsed,
      provider: job.provider_used,
      result: state === 'completed' ? resultObj : null,
    });
  } catch (err) {
    console.error('Status error:', err);
    res.status(500).json({ error: 'ARIA is having trouble. Please try again.' });
  }
}
