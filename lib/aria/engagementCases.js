// lib/aria/engagementCases.js
import pool from'../db';

export async function updateEngagementCases(orgId){
 if(!orgId)throw new Error('orgId required');
 const r=await pool.query(`SELECT id FROM people WHERE organization_id=$1 AND status='active'`,[orgId]);
 return r.rows.length;
}
