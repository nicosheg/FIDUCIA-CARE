// pages/api/identity/review-items.js
import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const orgId = req.query.organization_id || 'demo-org';

  try {
    const personRes = await pool.query(
      `SELECT id, first_name, phone, living_truth
       FROM people
       WHERE organization_id = $1
         AND living_truth IS NOT NULL
         AND status = 'active'
         AND living_truth->>'status' IN ('needs_decision', 'conflict')`,
      [orgId]
    );

    const items = personRes.rows.map(p => {
      const lt = p.living_truth;
      const matchedPersonId = lt.review?.matched_person_id || null;
      return {
        person_id: p.id,
        extracted_name: p.first_name,
        extracted_phone: p.phone,
        status: lt.status,
        confidence: lt.confidence || 70,
        candidates: lt.candidate_ids || [],
        resolved: false,
        matched_with: matchedPersonId,
        evidence: lt.review?.evidence || [],
        combined_score: lt.review?.combined_score || null,
      };
    });

    const stats = {
      total: items.length,
      alive: 0, // not used here
      needs_decision: items.filter(i => i.status === 'needs_decision').length,
      conflict: items.filter(i => i.status === 'conflict').length,
    };

    res.status(200).json({ items, stats });
  } catch (err) {
    console.error('Review items error:', err);
    res.status(500).json({ error: err.message });
  }
}
