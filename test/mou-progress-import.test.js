import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mouProgressImportPlan,requireEmptyMouTarget} from '../src/mou-progress-import-plan.js';
import schema from '../src/schema.json' with {type:'json'};
import {parseTable} from '../src/google-store.js';
const source={host:'192.168.0.44',project:'/var/www/html/digital_stn/hait-RG12',read_only:true};
function reference(){return {format:'standard-portal-mou-reference-v1',exported_at_utc:'2026-09-04T03:00:00Z',source,hospitals:[{id:'09625',reference_id:'GA0009625',name:'Fixture',type:'PCU'}],agency_groups:[],mou_categories:[{id:'1',category_number:1,title:'Fixture',sort_order:1}],mou_items:[{id:'11',category_id:'1',item_number:'1.1',title:'Fixture',target_group:'all',period:'all',sort_order:1}],mou_settings:[]};}
function data(){return {format:'standard-portal-mou-progress-v1',exported_at_utc:'2026-09-04T03:00:00Z',source,fiscal_year:2569,source_count:1,records:[{id:'42',hospital_id:'09625',item_id:'11',fiscal_year:2569,status:'completed',assessment_detail:'=literal not formula',evidence_type:'link',has_legacy_file:true,evidence_link:'https://example.test/evidence',admin_status:'approved',admin_comment:'Fixture comment',admin_reviewed_at:'2026-09-01 12:00:00',admin_reviewed_by:'reviewer',updated_at:'2026-09-01 12:00:00',updated_by:'5'}]};}
test('MOU import plan preserves literal text, scope, provenance and deferred file flags',()=>{
 const plan=mouProgressImportPlan(data(),reference()),records=parseTable(plan.name,[plan.headers,...plan.rows]);
 assert.equal(plan.summary.records,1);assert.equal(plan.summary.fiscalYear,2569);assert.equal(plan.summary.writesPerformed,false);
 assert.equal(plan.summary.filesPending,1);assert.equal(plan.summary.reviews.approved,1);
 assert.equal(records[0].id,'legacy-mou-42');assert.equal(records[0].hospital_id,'09625');
 assert.equal(records[0].assessment_detail,'=literal not formula');assert.equal(records[0].evidence_file,'legacy-file-pending');
 assert.equal(records[0].admin_reviewed_by,'legacy:reviewer');assert.equal(records[0].updated_by,'legacy:5');
 assert.equal(plan.name,'mou_progress');assert.ok(!plan.headers.includes('role'));
});
test('MOU export rejects wrong source/year/count, duplicate IDs and natural keys',()=>{
 for(const mutate of [d=>d.source={...source,read_only:false},d=>d.fiscal_year=2568,d=>d.records[0].fiscal_year=2568,d=>d.source_count=2,d=>{d.records.push({...d.records[0]});d.source_count=2;},d=>{d.records.push({...d.records[0],id:'43'});d.source_count=2;}]){
  const d=data();mutate(d);assert.throws(()=>mouProgressImportPlan(d,reference()),/MOU_EXPORT_/);
 }
});
test('MOU export rejects unknown columns, oversized strings, unsafe types and orphan references',()=>{
 for(const patch of [{password:'CANARY'},{hospital_id:'99999'},{hospital_id:9625},{item_id:'12'},{id:42},{status:'constructor'},{admin_status:'bad'},{admin_status:0},{evidence_type:0},{has_legacy_file:'1'},{assessment_detail:'x'.repeat(10001)},{updated_at:'not-date'},{updated_by:'5;command'}]){
  const d=data();Object.assign(d.records[0],patch);assert.throws(()=>mouProgressImportPlan(d,reference()),/MOU_EXPORT_/);
 }
});
test('invalid legacy link is flagged without fetching or turning into executable markup',()=>{
 const d=data();d.records[0].evidence_link='javascript:bad()';d.records[0].has_legacy_file=false;d.records[0].admin_status=null;d.records[0].updated_by=null;
 const plan=mouProgressImportPlan(d,reference());assert.equal(plan.summary.unsafeLinks,1);assert.equal(plan.summary.filesPending,0);assert.equal(plan.summary.reviews.pending,1);
});
test('initial import refuses any populated target including a partial previous attempt',()=>{
 requireEmptyMouTarget([schema.mou_progress.headers]);requireEmptyMouTarget([schema.mou_progress.headers,['',null]]);
 assert.throws(()=>requireEmptyMouTarget([['wrong']]),/MOU_TARGET_SCHEMA_MISMATCH/);
 for(const row of [['legacy-mou-42'],['','',0],['',null,'=FORMULA()']])assert.throws(()=>requireEmptyMouTarget([schema.mou_progress.headers,row]),/MOU_TARGET_NOT_EMPTY/);
});
test('export PHP is CLI-only, fixed year, read-only and excludes raw file paths and account reads',async()=>{
 const php=await readFile(new URL('../scripts/export-mou-progress.php',import.meta.url),'utf8');
 assert.match(php,/PHP_SAPI !== 'cli'/);assert.match(php,/\$year = 2569/);assert.match(php,/START TRANSACTION READ ONLY/);assert.match(php,/rollBack/);
 assert.ok(!/FROM users|FROM identities|SELECT \*|UPDATE |DELETE |INSERT INTO|file_get_contents|curl_/i.test(php));
 assert.match(php,/END AS has_legacy_file/);assert.ok(!/evidence_file\s*,/.test(php));
 assert.equal(php.split('__PROJECT_IDS_JSON__').length,2);
});
