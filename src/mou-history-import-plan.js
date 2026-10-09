import {fail} from './errors.js';
import {mouProgressImportPlan,MOU_IMPORT_YEAR} from './mou-progress-import-plan.js';

// Matches the legacy inventory + migration columns, not a new public API table.
export const MOU_HISTORY_HEADERS=['id','progress_id','admin_status','admin_comment','admin_reviewed_by','created_at','_version','_request_id'];
export const MOU_HISTORY_MAX_ROWS=5000;
const fields=['id','progress_id','hospital_id','item_id','fiscal_year','admin_status','admin_comment','admin_reviewed_by','created_at'];
function exact(value,keys){fail(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|'),'MOU_HISTORY_SCHEMA_MISMATCH');}
function id(value){fail(typeof value==='string'&&/^[1-9]\d{0,15}$/.test(value),'MOU_HISTORY_INVALID_ID');return value;}
function text(value,max){fail(value===null||typeof value==='string'&&value.length<=max,'MOU_HISTORY_INVALID_TEXT');return value??'';}
function timestamp(value){
 fail(typeof value==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value),'MOU_HISTORY_INVALID_DATE');
 // Calendar validation only; keep the database wall-clock string without timezone conversion.
 const date=new Date(value.replace(' ','T')+'Z');
 fail(Number.isFinite(date.getTime())&&date.toISOString().slice(0,19).replace('T',' ')===value,'MOU_HISTORY_INVALID_DATE');return value;
}
export function mouHistoryImportPlan(data,progress,reference){
 mouProgressImportPlan(progress,reference);
 exact(data,['format','exported_at_utc','source','fiscal_year','source_count','records']);
 exact(data.source,['host','project','read_only']);
 fail(data.format==='standard-portal-mou-history-v1'&&data.source.host==='192.168.0.44'&&data.source.project==='/var/www/html/digital_stn/hait-RG12'&&data.source.read_only===true,'MOU_HISTORY_WRONG_SOURCE');
 fail(data.fiscal_year===MOU_IMPORT_YEAR,'MOU_HISTORY_WRONG_YEAR');
 fail(typeof data.exported_at_utc==='string'&&Number.isFinite(Date.parse(data.exported_at_utc)),'MOU_HISTORY_INVALID_TIME');
 fail(Array.isArray(data.records)&&data.records.length<=MOU_HISTORY_MAX_ROWS,'MOU_HISTORY_LIMIT_EXCEEDED');
 fail(Number.isSafeInteger(data.source_count)&&data.source_count===data.records.length,'MOU_HISTORY_COUNT_MISMATCH');
 const parents=new Map(progress.records.map(r=>[r.id,r])),seen=new Set(),units=new Set(),linked=new Set(),newerParents=new Set(),resetParents=new Set();
 const reviews={approved:0,rejected:0};let reviewsAfterImportedLatest=0,reviewsWithoutLatestTimestamp=0,preservedReviewsBeforePendingReset=0;
 const requestId='mou-history-import-'+data.exported_at_utc.replace(/[^\d]/g,'');
 const rows=data.records.map(row=>{
  exact(row,fields);id(row.id);id(row.progress_id);id(row.item_id);
  fail(!seen.has(row.id),'MOU_HISTORY_DUPLICATE_ID');seen.add(row.id);
  fail(row.fiscal_year===MOU_IMPORT_YEAR||row.fiscal_year===String(MOU_IMPORT_YEAR),'MOU_HISTORY_WRONG_YEAR');
  const parent=parents.get(row.progress_id);fail(parent,'MOU_HISTORY_PARENT_NOT_IMPORTED');
  fail(typeof row.hospital_id==='string'&&row.hospital_id===parent.hospital_id&&row.item_id===parent.item_id,'MOU_HISTORY_PARENT_MISMATCH');
  fail(typeof row.admin_status==='string'&&Object.hasOwn(reviews,row.admin_status),'MOU_HISTORY_INVALID_REVIEW');reviews[row.admin_status]++;
  const created=timestamp(row.created_at),comment=text(row.admin_comment,10000),reviewer=text(row.admin_reviewed_by,100);
  if(!parent.admin_reviewed_at){
   reviewsWithoutLatestTimestamp++;
   // Legacy api_mou_save.php clears all review fields on a non-admin update.
   // Keep the event as history only when the complete reset shape and chronology agree.
   const pendingReset=parent.admin_status==='pending'&&parent.admin_reviewed_at===null&&parent.admin_comment===null&&parent.admin_reviewed_by===null&&parent.updated_at&&created<=timestamp(parent.updated_at);
   if(pendingReset){preservedReviewsBeforePendingReset++;resetParents.add(row.progress_id);}
   else newerParents.add(row.progress_id);
  }else if(created>timestamp(parent.admin_reviewed_at)){reviewsAfterImportedLatest++;newerParents.add(row.progress_id);}
  units.add(row.hospital_id);linked.add(row.progress_id);
  return ['legacy-mou-history-'+row.id,'legacy-mou-'+row.progress_id,row.admin_status,comment,reviewer?'legacy:'+reviewer:'',created,1,requestId];
 });
 return {name:'mou_review_history',headers:MOU_HISTORY_HEADERS,rows,summary:{fiscalYear:MOU_IMPORT_YEAR,records:rows.length,hospitals:units.size,linkedProgress:linked.size,reviews,reviewsAfterImportedLatest,reviewsWithoutLatestTimestamp,preservedReviewsBeforePendingReset,pendingResetParents:resetParents.size,parentsNeedingReconciliation:newerParents.size,readyForImport:newerParents.size===0,writesPerformed:false}};
}
export function requireEmptyMouHistoryTarget(values){
 fail(Array.isArray(values)&&JSON.stringify(values[0])===JSON.stringify(MOU_HISTORY_HEADERS),'MOU_HISTORY_TARGET_SCHEMA_MISMATCH');
 fail(values.slice(1).every(r=>Array.isArray(r)&&r.every(v=>v==null||v==='')),'MOU_HISTORY_TARGET_NOT_EMPTY');
}
