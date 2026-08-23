// pages/api/scan/start.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';
import { processVisionJob } from '../../../lib/visionProcessor';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { image_base64, program_name } = req.body;
  if (!image_base64) return res.status(400).json({ error: 'No image data' });

  const orgId = req.org.id; // from withOrg
  const programName = program_name || 'GIBEON';

  try {
    // Create job record
    const jobRes = await pool.query(
      `INSERT INTO scan_jobs (organization_id, status) VALUES ($1, 'pending') RETURNING id`,
      [orgId]
    );
    const jobId = jobRes.rows[0].id;

    // Respond immediately
    res.status(200).json({ job_id: jobId });

    // Process in background (fire and forget)
    processVisionJob(jobId, image_base64, orgId, programName).catch(err =>
      console.error('Background job failed:', err)
    );
  } catch (error) {
    console.error('Failed to start scan job:', error);
    res.status(500).json({ error: error.message });
  }
}

export default withOrg(handler);
