import {fail} from './errors.js';
import {MOU_HOSPITAL_IDS} from './mou-reference.js';
import {STATUS_LABELS,REVIEW_LABELS} from './mou-read.js';
import schema from './schema.json' with {type:'json'};
// Produce a reviewable plan. Native portal rows always win a natural-key conflict.
export function mouDeltaPlan(source,target){
 fail(source.format==='standard-portal-mou-all-v1'&&source.source?.read_only===true&&source.source.host==='192.168.0.44','INVALID_MIGRATION_SOURCE');
 const current=target.tables||target,seen=new Set(),natural=new Set(),changes=[],conflicts=[];
 const keys=['hospital_id','item_id','fiscal_year'];
 const nat=r=>keys.map(k=>String(r[k])).join('|');
 for(const raw of source.tables.mou_progress){
  const r=Object.fromEntries(schema.mou_progress.headers.map(k=>[k,raw[k]??'']));
  r.id='legacy-mou-'+String(raw.id);r.hospital_id=String(raw.hospital_id);r.item_id=String(raw.item_id);r.fiscal_year=Number(raw.fiscal_year);
  fail(/^legacy-mou-[1-9]\d{0,15}$/.test(r.id)&&MOU_HOSPITAL_IDS.includes(r.hospital_id)&&/^[1-9]\d{0,15}$/.test(r.item_id)&&Number.isInteger(r.fiscal_year)&&r.fiscal_year>=2500&&r.fiscal_year<=2700,'INVALID_MIGRATION_RECORD');
  fail(!seen.has(r.id)&&!natural.has(nat(r)),'DUPLICATE_MIGRATION_RECORD');seen.add(r.id);natural.add(nat(r));
  fail(Object.hasOwn(STATUS_LABELS,r.status)&&Object.hasOwn(REVIEW_LABELS,r.admin_status||'pending')&&!r.evidence_file,'INVALID_MIGRATION_RECORD');
  r.admin_status||='pending';r.admin_reviewed_by=r.admin_reviewed_by?'legacy:'+r.admin_reviewed_by:'';r.updated_by=r.updated_by?'legacy:'+r.updated_by:'';
  r._request_id='mou-delta-v1';
  const rows=current.mou_progress.filter(x=>nat(x)===nat(r));fail(rows.length<=1,'DUPLICATE_MOU_PROGRESS');const old=rows[0];
  const fields=schema.mou_progress.headers.filter(k=>!k.startsWith('_'));
  if(old&&fields.every(k=>String(old[k])===String(r[k])))continue;
  if(old&&(old.id!==r.id||old._version>1)){conflicts.push({sourceId:r.id,targetId:old.id,hospitalId:r.hospital_id,itemId:r.item_id,fiscalYear:r.fiscal_year,reason:'portal-record-preserved'});continue;}
  r._version=(old?old._version:0)+1;changes.push({table:'mou_progress',record:r,expectedVersion:old?old._version:0});
 }
 fail(current.mou_progress.length+changes.filter(c=>c.expectedVersion===0).length<=schema.mou_progress.maxRows,'TABLE_LIMIT_EXCEEDED');
 return {changes,conflicts,summary:{sourceRecords:source.tables.mou_progress.length,years:[...new Set(source.tables.mou_progress.map(r=>Number(r.fiscal_year)))],append:changes.filter(c=>!c.expectedVersion).length,update:changes.filter(c=>c.expectedVersion).length,preservedConflicts:conflicts.length}};
}
