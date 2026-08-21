// pages/api/priority-queue.js
import { getPriorityQueue } from '../../lib/aria/priorityQueue';
import { withOrg } from '../../lib/apiHelpers';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  
  const orgId = req.org.id; // From withOrg
  const limit = parseInt(req.query.limit) || 10;

  try {
    const items = await getPriorityQueue(orgId, limit);
    res.status(200).json(items);
  } catch (err) {
    console.error('Priority queue error:', err);
    res.status(500).json({ error: err.message });
  }
}

export default withOrg(handler);
