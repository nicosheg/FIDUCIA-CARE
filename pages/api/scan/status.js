import pool from '../../../lib/db';

export default async function handler(req, res) {
  const jobId = req.query.job_id;
  if (!jobId) return res.status(400).json({ error: 'Missing job_id' });

  try {
    const jobRes = await pool.query(`SELECT status, result FROM scan_jobs WHERE id = $1`, [jobId]);
    if (jobRes.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const job = jobRes.rows[0];
    res.status(200).json({
      status: job.status,
      result: job.result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
               }
