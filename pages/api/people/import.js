// pages/api/people/import.js
import pool from '../../../lib/db';
import {withOrg} from '../../../lib/apiHelpers';
import {normalizePhone} from '../../../lib/phoneUtils';

function csv(text){
const rows=[];let row=[],cell='',quote=false;
for(let i=0;i<text.length;i++){
const c=text[i],n=text[i+1];
if(c==='"'){
if(quote&&n==='"'){cell+='"';i++}else quote=!quote;
}else if(c===','&&!quote){row.push(cell);cell=''}
else if((c==='\n'||c==='\r')&&!quote){
if(c==='\r'&&n==='\n')i++;
row.push(cell);
if(row.some(v=>v.trim()!==''))rows.push(row);
row=[];cell='';
}else cell+=c;
}
if(cell!==''||row.length){row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row)}
if(!rows.length)return [];
const headers=rows.shift().map(x=>x.trim().toLowerCase().replace(/\s+/g,'_'));
return rows.map(r=>Object.fromEntries(headers.map((h,i)=>[h,(r[i]||'').trim()])));
}

const clean=v=>String(v??'').trim();
const email=v=>clean(v).toLowerCase()||null;

async function handler(req,res){
if(req.method!=='POST'){
res.setHeader('Allow','POST');
return res.status(405).json({error:'Method not allowed'});
}
const orgId=req.org.id,body=req.body||{};
try{
let rows=Array.isArray(body.rows)?body.rows:null;
if(!rows&&typeof body.csv==='string')rows=csv(body.csv);
if(!Array.isArray(rows)||!rows.length)return res.status(400).json({error:'rows or csv is required'});
if(rows.length>5000)return res.status(400).json({error:'Import is limited to 5000 rows per request'});
let created=0,updated=0,skipped=0;
const errors=[];
const client=await pool.connect();
try{
await client.query('BEGIN');
for(let i=0;i<rows.length;i++){
const r=rows[i]||{};
const first=clean(r.first_name||r.name);
const last=clean(r.last_name);
if(!first){skipped++;continue}
const phone=normalizePhone(r.phone)||null;
const normalizedEmail=email(r.email);
const type=clean(r.type||r.role)||'visitor';
const birthday=clean(r.birthday)||null;
try{
let existing=null;
if(phone){
existing=(await client.query(`SELECT id FROM people WHERE organization_id=$1 AND phone=$2 AND COALESCE(status,'active')='active' ORDER BY created_at ASC LIMIT 1`,[orgId,phone])).rows[0]||null;
}
if(!existing&&normalizedEmail){
existing=(await client.query(`SELECT id FROM people WHERE organization_id=$1 AND email=$2 AND COALESCE(status,'active')='active' ORDER BY created_at ASC LIMIT 1`,[orgId,normalizedEmail])).rows[0]||null;
}
if(existing){
await client.query(`UPDATE people SET first_name=$3,last_name=$4,phone=COALESCE($5,phone),email=COALESCE($6,email),type=$7,birthday=COALESCE($8,birthday),updated_at=NOW() WHERE organization_id=$1 AND id=$2`,[orgId,existing.id,first,last,phone,normalizedEmail,type,birthday]);
updated++;
}else{
await client.query(`INSERT INTO people(organization_id,first_name,last_name,phone,email,type,birthday,created_by,living_truth,status,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'active','import')`,[orgId,first,last,phone,normalizedEmail,type,birthday,req.user.id,JSON.stringify({status:'alive',confidence:70,source:'import',updated_at:new Date().toISOString()})]);
created++;
}
}catch(e){
errors.push({row:i+1,error:e.message});
}
}
await client.query('COMMIT');
}catch(e){
await client.query('ROLLBACK');
throw e;
}finally{
client.release();
}
return res.status(200).json({total:rows.length,created,updated,skipped,errors});
}catch(e){
console.error('People import:',e);
return res.status(500).json({error:'Unable to import people'});
}
}

export default withOrg(handler);
