import pool from '../../../lib/db';

export default async function handler(req, res) {
  const jobId = req.query.job_id;
  if (!jobId) return res.status(400).json({ error: 'Missing job_id' });

  try {
    const jobRes = await pool.query(
      `SELECT status, progress, result, retry_count FROM scan_jobs WHERE id = $1`,
      [jobId]
    );
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const job = jobRes.rows[0];
    let result = job.result ? JSON.parse(job.result) : null;
    let message = '';
    let status = job.status;

    // Build friendly message based on status and result
    if (status === 'pending' || status === 'queued') {
      message = 'ARIA is preparing to read the register…';
    } else if (status === 'processing') {
      message = 'ARIA is reading your register…';
    } else if (status === 'retrying') {
      // Use stored retry message if present, else default
      message = result?.message || 'ARIA is taking a little longer than usual…';
    } else if (status === 'complete') {
      message = 'Scan complete.';
    } else if (status === 'failed') {
      // Always show friendly message
      const errorMsg = result?.error || 'ARIA could not read the register. Please try again with a clearer photo.';
      // If the stored error looks raw, override with generic
      if (errorMsg.includes('Rate limit') || errorMsg.includes('rate limit') || 
          errorMsg.includes('Groq') || errorMsg.includes('API') || errorMsg.includes('tokens')) {
        message = 'ARIA is very busy right now. Please try again in a few minutes.';
      } else {
        message = errorMsg;
      }
    } else {
      message = 'ARIA is preparing…';
    }

    // Return sanitized response
    res.status(200).json({
      status: status,
      progress: job.progress,
      message,
      retry_count: job.retry_count || 0,
      // Only return result if complete
      result: status === 'complete' ? result : null,
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({ error: 'ARIA is having trouble. Please try again.' });
  }
                                           }
