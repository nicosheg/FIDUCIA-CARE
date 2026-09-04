// lib/aria/organizationMemory.js
import pool from '../db';

export async function setMemory(orgId,memoryType,memoryKey,value,confidence=.8,source='aria'){
 if(!orgId||!memoryType||!memoryKey)throw new Error('orgId, memoryType and memoryKey are required');
 const result=await pool.query(`
  INSERT INTO organization_memory(
   organization_id,memory_type,memory_key,memory_value,confidence,source,created_at,updated_at
  )VALUES($1,$2,$3,$4,$5,$6,NOW(),NOW())
  ON CONFLICT(organization_id,memory_type,memory_key)
  DO UPDATE SET
   memory_value=EXCLUDED.memory_value,
   confidence=EXCLUDED.confidence,
   source=EXCLUDED.source,
   updated_at=NOW()
  RETURNING *
 `,[orgId,memoryType,memoryKey,value&&typeof value==='object'?value:{},Math.max(0,Math.min(1,Number(confidence)||0)),source]);
 return result.rows[0];
}

export async function getMemory(orgId,memoryType=null,memoryKey=null){
 if(!orgId)throw new Error('orgId required');
 const params=[orgId];
 let where='organization_id=$1';
 if(memoryType){params.push(memoryType);where+=` AND memory_type=$${params.length}`}
 if(memoryKey){params.push(memoryKey);where+=` AND memory_key=$${params.length}`}
 const result=await pool.query(`SELECT * FROM organization_memory WHERE ${where} ORDER BY confidence DESC,updated_at DESC`,params);
 return result.rows;
}
