// pages/api/scan/start.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';
import { processVisionJob } from '../../../lib/visionProcessor';

async function handler(req, res) {
  console.log('[SCAN] Start request received');

  if (req.method !== 'POST') {
    console.log('[SCAN] Method not allowed:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image_base64, program_name } = req.body;
  // Guard against undefined first
  if (!image_base64 || typeof image_base64 !== 'string' || image_base64.length < 100) {
    console.error('[SCAN] Image data missing or too short');
    return res.status(400).json({ error: 'Image data is empty or invalid' });
  }

  console.log('[SCAN] Image received, length:', image_base64.length);

  const orgId = req.org.id;
  console.log('[SCAN] Organization ID:', orgId);

  const programName = program_name || 'GIBEON';

  try {
    const jobRes = await pool.query(
      `INSERT INTO scan_jobs (organization_id, status) VALUES ($1, 'pending') RETURNING id`,
      [orgId]
    );
    const jobId = jobRes.rows[0].id;
    console.log('[SCAN] Job created:', jobId);

    // Respond immediately
    res.status(200).json({ job_id: jobId });

    // Process in background (fire and forget)
    processVisionJob(jobId, image_base64, orgId, programName).catch(err => {
      console.error('[SCAN] Background job failed:', err.message, err.stack);
    });
  } catch (error) {
    console.error('[SCAN] Start error:', error.message, error.stack);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

export default withOrg(handler);
