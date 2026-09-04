// lib/aria/organizationSettings.js
import pool from '../db';

const defaults={
 engagement_cycle_days:7,
 risk_threshold_1:1,
 risk_threshold_2:2,
 risk_threshold_3:4
};

export async function getOrgSettings(orgId){
 if(!orgId)throw new Error('orgId required');

 const result=await pool.query(`
  SELECT engagement_cycle_days,risk_threshold_1,risk_threshold_2,risk_threshold_3
  FROM organization_settings
  WHERE organization_id=$1
 `,[orgId]);

 return result.rows[0]||defaults;
}

export async function upsertOrgSettings(orgId,settings={}){
 if(!orgId)throw new Error('orgId required');

 const engagementCycleDays=Math.max(1,Number(settings.engagement_cycle_days)||7);
 const risk1=Math.max(0,Number(settings.risk_threshold_1)||1);
 const risk2=Math.max(risk1,Number(settings.risk_threshold_2)||2);
 const risk3=Math.max(risk2,Number(settings.risk_threshold_3)||4);

 const result=await pool.query(`
  INSERT INTO organization_settings(
   organization_id,engagement_cycle_days,risk_threshold_1,risk_threshold_2,risk_threshold_3,created_at,updated_at
  )VALUES($1,$2,$3,$4,$5,NOW(),NOW())
  ON CONFLICT(organization_id)
  DO UPDATE SET
   engagement_cycle_days=EXCLUDED.engagement_cycle_days,
   risk_threshold_1=EXCLUDED.risk_threshold_1,
   risk_threshold_2=EXCLUDED.risk_threshold_2,
   risk_threshold_3=EXCLUDED.risk_threshold_3,
   updated_at=NOW()
  RETURNING *
 `,[orgId,engagementCycleDays,risk1,risk2,risk3]);

 return result.rows[0];
}
