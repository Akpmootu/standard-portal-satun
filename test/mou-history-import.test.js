import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mouHistoryImportPlan,requireEmptyMouHistoryTarget,MOU_HISTORY_HEADERS} from '../src/mou-history-import-plan.js';
const source={host:'192.168.0.44',project:'/var/www/html/digital_stn/hait-RG12',read_only:true};
function reference(){return {format:'standard-portal-mou-reference-v1',exported_at_utc:'2026-09-04T03:00:00Z',source:{...source},hospitals:[{id:'09625',reference_id:'GA0009625',name:'Fixture',type:'PCU'}],agency_groups:[],mou_categories:[{id:'1',category_number:1,title:'Fixture',sort_order:1}],mou_items:[{id:'11',category_id:'1',item_number:'1.1',title:'Fixture',target_group:'all',period:'all',sort_order:1}],mou_settings:[]};}
function progress(){return {format:'standard-portal-mou-progress-v1',exported_at_utc:'2026-09-04T03:00:00Z',source:{...source},fiscal_year:2569,source_count:1,records:[{id:'42',hospital_id:'09625',item_id:'11',fiscal_year:2569,status:'completed',assessment_detail:'Fixture',evidence_type:'none',has_legacy_file:false,evidence_link:null,admin_status:'approved',admin_comment:'Fixture',admin_reviewed_at:'2026-09-01 12:00:00',admin_reviewed_by:'Fixture reviewer',updated_at:'2026-09-01 12:00:00',updated_by:'5'}]};}
function history(){return {format:'standard-portal-mou-history-v1',exported_at_utc:'2026-09-04T08:00:00Z',source:{...source},fiscal_year:2569,source_count:1,records:[{id:'9',progress_id:'42',hospital_id:'09625',item_id:'11',fiscal_year:2569,admin_status:'rejected',admin_comment:'=literal text',admin_reviewed_by:'Fixture reviewer',created_at:'2026-08-01 12:00:00'}]};}
const plan=(h=history(),p=progress())=>mouHistoryImportPlan(h,p,reference());
test('history preserves text and attribution without changing latest assessment or identities',()=>{
 const h=history(),p=progress(),before=structuredClone(p),out=plan(h,p);
 assert.deepEqual(out.headers,MOU_HISTORY_HEADERS);
 assert.deepEqual(out.rows[0].slice(0,7),['legacy-mou-history-9','legacy-mou-42','rejected','=literal text','legacy:Fixture reviewer','2026-08-01 12:00:00',1]);
 assert.deepEqual(p,before);assert.equal(out.summary.readyForImport,true);assert.equal(out.summary.writesPerformed,false);
 assert.equal(out.summary.reviews.rejected,1);assert.equal(out.summary.linkedProgress,1);
});
test('history allows multiple review events per assessment and dates outside the fiscal calendar',()=>{
 const h=history();h.records.push({...h.records[0],id:'10',created_at:'2025-10-01 00:00:00',admin_status:'approved',admin_comment:null,admin_reviewed_by:null});h.source_count=2;
 const out=plan(h);assert.equal(out.rows.length,2);assert.equal(out.summary.linkedProgress,1);assert.equal(out.rows[1][4],'');
});
test('history rejects source, schema, fiscal year, count and limit mismatches',()=>{
 for(const mutate of [h=>h.source.read_only=false,h=>h.source.host='other',h=>h.format='other',h=>h.fiscal_year=2568,h=>h.extra='bad',h=>h.source_count=2,h=>h.exported_at_utc='bad',h=>h.records=null,h=>{h.records=Array(5001).fill(h.records[0]);h.source_count=5001;}]){
  const h=history();mutate(h);assert.throws(()=>plan(h),/MOU_HISTORY_/);
 }
});
test('history rejects duplicate event IDs and unimported or mismatched parents',()=>{
 for(const patch of [{progress_id:'43'},{hospital_id:'00872'},{item_id:'12'},{fiscal_year:2568},{id:9},{progress_id:42},{item_id:11}]){
  const h=history();Object.assign(h.records[0],patch);assert.throws(()=>plan(h),/MOU_HISTORY_/);
 }
 const h=history();h.records.push({...h.records[0]});h.source_count=2;assert.throws(()=>plan(h),/MOU_HISTORY_DUPLICATE_ID/);
});
test('history validates review fields and real calendar dates',()=>{
 for(const patch of [{admin_status:'pending'},{admin_status:'constructor'},{admin_status:null},{admin_status:['approved']},{admin_comment:4},{admin_comment:'x'.repeat(10001)},{admin_reviewed_by:'x'.repeat(101)},{created_at:null},{created_at:'2026-02-30 00:00:00'},{created_at:'2026-01-01 24:00:00'},{created_at:'2026-08-01T12:00:00Z'},{password:'CANARY'}]){
  const h=history();Object.assign(h.records[0],patch);assert.throws(()=>plan(h),/MOU_HISTORY_/);
 }
});
test('newer history and missing latest timestamps require reconciliation without overwriting progress',()=>{
 for(const latest of [null,'2026-07-01 12:00:00']){
  const p=progress();p.records[0].admin_reviewed_at=latest;const before=structuredClone(p),out=plan(history(),p);
  assert.equal(out.summary.readyForImport,false);assert.equal(out.summary.reviewsAfterImportedLatest,latest?1:0);assert.equal(out.summary.reviewsWithoutLatestTimestamp,latest?0:1);assert.equal(out.summary.parentsNeedingReconciliation,1);assert.deepEqual(p,before);
 }
});
test('legacy pending reset preserves prior events without changing current pending status',()=>{
 for(const status of ['approved','rejected']){
  const h=history(),p=progress();h.records[0].admin_status=status;
  Object.assign(p.records[0],{admin_status:'pending',admin_comment:null,admin_reviewed_at:null,admin_reviewed_by:null});
  const before=structuredClone(p),out=plan(h,p);
  assert.equal(out.summary.readyForImport,true);assert.equal(out.summary.preservedReviewsBeforePendingReset,1);assert.equal(out.summary.pendingResetParents,1);assert.equal(out.summary.reviewsAfterImportedLatest,0);assert.equal(out.rows[0][2],status);assert.deepEqual(p,before);
 }
});
test('pending reset exception requires cleared fields and valid update chronology',()=>{
 for(const patch of [{admin_status:'approved'},{admin_status:null},{admin_comment:''},{admin_comment:'remaining'},{admin_reviewed_by:'remaining'},{admin_reviewed_at:''},{updated_at:null},{updated_at:'2026-07-31 23:59:59'}]){
  const p=progress();Object.assign(p.records[0],{admin_status:'pending',admin_comment:null,admin_reviewed_at:null,admin_reviewed_by:null},patch);
  const out=plan(history(),p);assert.equal(out.summary.readyForImport,false);assert.equal(out.summary.preservedReviewsBeforePendingReset,0);
 }
 const p=progress();Object.assign(p.records[0],{admin_status:'pending',admin_comment:null,admin_reviewed_at:null,admin_reviewed_by:null,updated_at:'2026-02-30 00:00:00'});
 assert.throws(()=>plan(history(),p),/MOU_HISTORY_INVALID_DATE/);
});
test('one later event still blocks a parent with an otherwise valid pending reset',()=>{
 const p=progress(),h=history();Object.assign(p.records[0],{admin_status:'pending',admin_comment:null,admin_reviewed_at:null,admin_reviewed_by:null});
 h.records.push({...h.records[0],id:'10',created_at:'2026-09-02 00:00:00'});h.source_count=2;
 const out=plan(h,p);assert.equal(out.summary.preservedReviewsBeforePendingReset,1);assert.equal(out.summary.parentsNeedingReconciliation,1);assert.equal(out.summary.readyForImport,false);
});
test('empty history is valid and target guard refuses partial imports',()=>{
 const h=history();h.records=[];h.source_count=0;assert.equal(plan(h).summary.records,0);
 requireEmptyMouHistoryTarget([MOU_HISTORY_HEADERS]);requireEmptyMouHistoryTarget([MOU_HISTORY_HEADERS,['',null]]);
 assert.throws(()=>requireEmptyMouHistoryTarget([['wrong']]),/MOU_HISTORY_TARGET_SCHEMA_MISMATCH/);
 for(const row of [['existing'],['',0],['','=FORMULA()']])assert.throws(()=>requireEmptyMouHistoryTarget([MOU_HISTORY_HEADERS,row]),/MOU_HISTORY_TARGET_NOT_EMPTY/);
});
test('history PHP is bounded, parent-year scoped and read-only with no account or evidence reads',async()=>{
 const php=await readFile(new URL('../scripts/export-mou-history.php',import.meta.url),'utf8');
 for(const pattern of [/PHP_SAPI !== 'cli'/,/START TRANSACTION READ ONLY/,/rollBack/,/\$year = 2569/,/p\.fiscal_year = \?/,/p\.hospital_id IN/,/JOIN mou_progress p ON p.id = h.progress_id/,/LIMIT 5001/])assert.match(php,pattern);
 assert.ok(!/SELECT \*|UPDATE |DELETE |INSERT INTO|FROM users|JOIN users|evidence_link|file_get_contents|curl_/i.test(php));
 assert.equal(php.split('__PROJECT_IDS_JSON__').length,2);
});
test('owner history helper pins imported snapshot hashes and writes exclusively without raw logs',async()=>{
 const js=await readFile(new URL('../scripts/export-mou-history-local.js',import.meta.url),'utf8');
 for(const pattern of [/receipt.sourceSha256!==sha\(progressBody\)/,/receipt.referenceSha256!==sha\(refBody\)/,/receipt.verifiedRows!==progress.records.length/,/flag:'wx'/,/windowsHide:true/,/mouHistoryImportPlan\(data,progress,reference\)/])assert.match(js,pattern);
 assert.ok(!/console\.(?:log|error)\((?:result|data|error)\)/.test(js));
});
