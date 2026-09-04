// lib/aria/organizationSettings.js
import pool from'../db';

const defaults={engagement_cycle_days:7};

export async function getOrgSettings(orgId){
 if(!orgId)throw new Error('orgId required');
 const r=await pool.query(`SELECT engagement_cycle_days FROM organization_settings WHERE organization_id=$1 LIMIT 1`,[orgId]);
 return r.rows[0]||defaults;
}

export async function upsertOrgSettings(orgId,settings={}){
 if(!orgId)throw new Error('orgId required');
 const days=Math.max(1,Number(settings.engagement_cycle_days)||7);
 const r=await pool.query(`INSERT INTO organization_settings(organization_id,engagement_cycle_days,created_at,updated_at)VALUES($1,$2,NOW(),NOW()) ON CONFLICT(organization_id) DO UPDATE SET engagement_cycle_days=EXCLUDED.engagement_cycle_days,updated_at=NOW() RETURNING *`,[orgId,days]);
 return r.rows[0];
}
