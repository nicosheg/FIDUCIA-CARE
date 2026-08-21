// pages/api/identity/review-items.js
import pool from '../../../lib/db';
import { withOrg } from '../../../lib/apiHelpers';

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const orgId = req.org.id;

  try {
    // Get people with living_truth that have a review object
    const personRes = await pool.query(
      `SELECT id, first_name, phone, living_truth
       FROM people
       WHERE organization_id = $1
         AND status = 'active'
         AND living_truth IS NOT NULL
         AND living_truth->>'status' IN ('needs_decision', 'conflict')
         AND living_truth->'review' IS NOT NULL`,
      [orgId]
    );

    // Group by pair (sorted ids) to avoid duplicates
    const pairMap = new Map();
    for (const p of personRes.rows) {
      const lt = p.living_truth;
      const review = lt.review;
      if (!review) continue;
      const matchedId = review.matched_person_id;
      if (!matchedId) continue;

      const key = p.id < matchedId ? `${p.id}:${matchedId}` : `${matchedId}:${p.id}`;
      if (!pairMap.has(key)) {
        pairMap.set(key, {
          person_a: p.id,
          person_b: matchedId,
          status: lt.status,
          score: review.score || 0,
          reasons: review.reasons || [],
          evidence: review.evidence || [],
          decision: review.decision || null,
          created_at: lt.updated_at || null,
        });
      }
    }

    // Fetch names and phones for all unique persons in the pairs
    const allIds = new Set();
    for (const [key, pair] of pairMap) {
      allIds.add(pair.person_a);
      allIds.add(pair.person_b);
    }
    const idList = Array.from(allIds);
    const peopleRes = await pool.query(
      `SELECT id, first_name, phone FROM people WHERE id = ANY($1) AND organization_id = $2`,
      [idList, orgId]
    );
    const peopleMap = {};
    peopleRes.rows.forEach(p => {
      peopleMap[p.id] = { name: p.first_name, phone: p.phone };
    });

    const items = [];
    for (const [key, pair] of pairMap) {
      const personA = peopleMap[pair.person_a];
      const personB = peopleMap[pair.person_b];
      if (!personA || !personB) continue;
      items.push({
        person_id: pair.person_a,
        person_name: personA.name,
        person_phone: personA.phone,
        matched_person_id: pair.person_b,
        matched_person_name: personB.name,
        matched_person_phone: personB.phone,
        status: pair.status,
        score: pair.score,
        reasons: pair.reasons,
        evidence: pair.evidence,
        decision: pair.decision,
        created_at: pair.created_at,
      });
    }

    const stats = {
      total: items.length,
      needs_decision: items.filter(i => i.status === 'needs_decision').length,
      conflict: items.filter(i => i.status === 'conflict').length,
    };

    res.status(200).json({ items, stats });
  } catch (err) {
    console.error('Review items error:', err);
    res.status(500).json({ error: err.message });
  }
}

export default withOrg(handler);
