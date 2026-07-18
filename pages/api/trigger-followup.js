import { supabaseAdmin } from '../../lib/supabaseClient';
import { processAbsentees } from '../../utils/followUp';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const churchId = req.body.church_id || 'demo-church';
  const today = new Date().toISOString().slice(0, 10);

  // Run follow‑up (this will use the latest call script from the settings table)
  try {
    await processAbsentees(churchId, today);
    res.status(200).json({ message: 'Follow‑up calls initiated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
