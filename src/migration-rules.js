import {fail} from './errors.js';
import {writeActor,bangkokTimestamp} from './mou-write-rules.js';
import {MOU_HOSPITAL_IDS} from './mou-reference.js';
export const MIGRATION_HEADERS=['id','hospital_id','item_id','fiscal_year','status','assessment_detail','evidence_type','evidence_file','evidence_link','admin_status','admin_comment','admin_reviewed_at','admin_reviewed_by','updated_at','updated_by','_version','_request_id'];
export function normalizeMigrationCommand(c){
 fail(c&&Object.keys(c).sort().join('|')==='action|requestId|rows'&&c.action==='import-mou'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(c.requestId)&&Array.isArray(c.rows)&&c.rows.length>0&&c.rows.length<=25,'INVALID_MIGRATION_COMMAND',400);
 const ids=new Set();
 for(const entry of c.rows){
  fail(entry&&Object.keys(entry).sort().join('|')==='expectedVersion|record|table'&&entry.table==='mou_progress'&&Number.isSafeInteger(entry.expectedVersion)&&[0,1].includes(entry.expectedVersion),'INVALID_MIGRATION_COMMAND',400);
  const r=entry.record;fail(r&&Object.keys(r).sort().join('|')===[...MIGRATION_HEADERS].sort().join('|'),'INVALID_MIGRATION_RECORD',400);
  fail(typeof r.id==='string'&&/^legacy-mou-[1-9]\d{0,15}$/.test(r.id)&&!ids.has(r.id)&&MOU_HOSPITAL_IDS.includes(r.hospital_id)&&/^[1-9]\d{0,15}$/.test(r.item_id)&&Number.isInteger(r.fiscal_year)&&r.fiscal_year>=2500&&r.fiscal_year<=2700&&r._version===entry.expectedVersion+1&&r._request_id==='mou-delta-v1','INVALID_MIGRATION_RECORD',400);ids.add(r.id);
  fail(['none','completed','in_progress','cannot_do'].includes(r.status)&&['pending','approved','rejected'].includes(r.admin_status)&&['none','link'].includes(r.evidence_type)&&r.evidence_file==='','INVALID_MIGRATION_RECORD',400);
  for(const k of MIGRATION_HEADERS.filter(k=>!['fiscal_year','_version'].includes(k)))fail(typeof r[k]==='string'&&r[k].length<=(['assessment_detail','admin_comment'].includes(k)?10000:2048),'INVALID_MIGRATION_RECORD',400);
 }
 return c;
}
export function planMigration(tables,identity,input,sha,now=new Date()){
 const c=normalizeMigrationCommand(input),actor=writeActor(identity,tables);fail(actor.role==='admin','ADMIN_REQUIRED',403);fail(/^[a-f0-9]{64}$/.test(sha),'INVALID_PAYLOAD_HASH',400);
 const receipts=tables.write_requests.filter(r=>r.request_id===c.requestId);fail(receipts.length<=1,'DUPLICATE_REQUEST_RECORD');
 if(receipts.length){const r=receipts[0];fail(r.actor_id===actor.id&&r.record_type==='migration'&&r.operation===c.action&&r.payload_sha256===sha&&r.state==='committed','REQUEST_ID_REUSED',409);return {replayed:true,result:{ok:true,requestId:c.requestId,recordId:r.record_id,version:1,replayed:true}};}
 const changes=[],seen=new Set();
 for(const e of c.rows){const r=e.record,natural=r.hospital_id+'|'+r.item_id+'|'+r.fiscal_year;fail(!seen.has(natural),'DUPLICATE_MOU_PROGRESS');seen.add(natural);fail(tables.mou_items.some(i=>i.id===r.item_id),'ITEM_NOT_FOUND',404);
  const matches=tables.mou_progress.filter(x=>x.hospital_id===r.hospital_id&&x.item_id===r.item_id&&Number(x.fiscal_year)===r.fiscal_year);fail(matches.length<=1,'DUPLICATE_MOU_PROGRESS');const old=matches[0];
  fail(old?old.id===r.id&&old._version===e.expectedVersion:e.expectedVersion===0,'VERSION_CONFLICT',409);fail(!tables.mou_progress.some(x=>x.id===r.id&&x!==old),'DUPLICATE_MOU_PROGRESS');changes.push({table:e.table,record:r,existing:Boolean(old)});
 }
 const time=bangkokTimestamp(now),id='migration-'+c.requestId;
 changes.push({table:'audit_log',existing:false,record:{id,actor_id:actor.id,action:c.action,record_type:'migration',record_id:id,hospital_id:'',request_id:c.requestId,changed_fields:JSON.stringify(c.rows.map(r=>r.record.id)),created_at:time}});
 changes.push({table:'write_requests',existing:false,record:{request_id:c.requestId,actor_id:actor.id,operation:c.action,payload_sha256:sha,record_type:'migration',record_id:id,state:'committed',result_version:1,created_at:time,completed_at:time}});
 return {changes,replayed:false,result:{ok:true,requestId:c.requestId,recordId:id,version:1,replayed:false}};
}
