// pages/api/priority-queue.js
import { getPriorityQueue } from '../../lib/aria/priorityQueue';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const orgId = req.query.organization_id || 'demo-org';
  const limit = parseInt(req.query.limit) || 10;

  try {
    const items = await getPriorityQueue(orgId, limit);
    res.status(200).json(items);
  } catch (err) {
    console.error('Priority queue error:', err);
    res.status(500).json({ error: err.message });
  }
}
