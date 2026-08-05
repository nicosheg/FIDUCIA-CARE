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
    let message = '';

    if (job.status === 'processing') {
      message = 'ARIA is reading your register…';
    } else if (job.status === 'retrying') {
      message = 'ARIA is busy analysing your register. This may take a little longer than usual.';
    } else if (job.status === 'complete') {
      message = 'Scan complete.';
    } else if (job.status === 'failed') {
      message = 'ARIA could not read the register. Please try again with a clearer photo.';
    }

    res.status(200).json({
      status: job.status,
      progress: job.progress,
      message,
      retry_count: job.retry_count,
      result: job.result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
        }
