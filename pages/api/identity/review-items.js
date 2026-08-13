// pages/api/identity/review-items.js
import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const orgId = req.query.organization_id || 'demo-org';

  try {
    // 1. Get person‑level unresolved states
    const personRes = await pool.query(
      `SELECT id, first_name, phone, living_truth
       FROM people
       WHERE organization_id = $1
         AND living_truth IS NOT NULL
         AND status = 'active'`,
      [orgId]
    );
    const personItems = personRes.rows.map(p => ({
      extracted_name: p.first_name,
      extracted_phone: p.phone,
      person_id: p.id,
      status: p.living_truth.status,
      candidates: p.living_truth.candidates || [],
      confidence: p.living_truth.confidence || 70,
      resolved: false, // person-level unresolved
    }));

    // 2. Get orphaned observations from the latest scan that have no person yet
    const scanRes = await pool.query(
      `SELECT result FROM scan_jobs
       WHERE organization_id = $1 AND status = 'complete'
       ORDER BY created_at DESC
       LIMIT 1`,
      [orgId]
    );
    let scanItems = [];
    if (scanRes.rows.length > 0) {
      const result = scanRes.rows[0].result;
      const needsReview = result.needs_review || [];
      // Filter out those that already have a person (i.e., have resolved_person_id)
      // and those that are already resolved.
      scanItems = needsReview
        .filter(item => !item.resolved && !item.resolved_person_id)
        .map(item => ({
          extracted_name: item.extracted_name,
          extracted_phone: item.extracted_phone,
          person_id: null, // orphaned
          status: item.status,
          candidates: item.candidates || [],
          confidence: item.confidence || 70,
          resolved: false,
        }));
    }

    // Combine: person-level items first, then scan-level orphaned
    const allItems = [...personItems, ...scanItems];

    const stats = {
      total: allItems.length,
      alive: allItems.filter(i => i.status === 'alive').length,
      needs_decision: allItems.filter(i => i.status === 'needs_decision').length,
      conflict: allItems.filter(i => i.status === 'conflict').length,
    };

    res.status(200).json({ items: allItems, stats });
  } catch (err) {
    console.error('Review items error:', err);
    res.status(500).json({ error: err.message });
  }
        }
