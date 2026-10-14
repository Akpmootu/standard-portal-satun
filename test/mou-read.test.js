import test from 'node:test';
import assert from 'node:assert/strict';
import {loadMouWorkspace,normalizeCatalog,currentFiscalYear,safeEvidenceUrl,legacyLock} from '../src/mou-read.js';
import {readOnlyPage} from '../src/read-only-page.js';
const now=new Date('2026-09-04T01:00:00Z');
const access={status:'active',user:{role:'hospital',hospitalId:'09625',userGroup:'โรงพยาบาลส่งเสริมสุขภาพตำบล'}};
const admin={status:'active',user:{role:'admin'}};
const categories=[{id:'10',category_number:1,title:'หมวดทดสอบ',sort_order:1},{id:'60',category_number:6,title:'หมวดปฐมภูมิ',sort_order:6}];
const items=[{id:'101',category_id:'10',item_number:'1.1',title:'หัวข้อทดสอบ',target_group:'all',period:'6_months',sort_order:1},{id:'102',category_id:'10',item_number:'1.2',title:'หัวข้อทดสอบ 2',target_group:'all',period:'all',sort_order:2},{id:'601',category_id:'60',item_number:'6.1',title:'หัวข้อปฐมภูมิ',target_group:'pcu',period:'all',sort_order:3}];
const settings=[{id:'1',setting_key:'allow_6months_edit',setting_value:'0'},{id:'2',setting_key:'allow_9_12months_edit',setting_value:'1'}];
function fixture(overrides={}) {
 const calls=[];
 const tables={mou_categories:categories,mou_items:items,mou_settings:settings,mou_agencies:[{id:'09625',user_group:'โรงพยาบาลส่งเสริมสุขภาพตำบล',classification_source:'legacy_export',status:'confirmed'}],users:[],mou_progress:[
  {id:'p1',hospital_id:'09625',item_id:'101',fiscal_year:2569,status:'completed',admin_status:'approved',assessment_detail:'ข้อมูลในชีต',admin_comment:'',updated_at:'2026-09-03T00:00:00Z',evidence_link:'https://example.org/evidence'},
  {id:'p2',hospital_id:'09626',item_id:'101',fiscal_year:2569,status:'completed',assessment_detail:'CROSS-HOSPITAL-CANARY'},
  {id:'p3',hospital_id:'09625',item_id:'101',fiscal_year:2568,status:'completed',assessment_detail:'PREVIOUS-YEAR-CANARY'},
 ],...overrides};
 return {tables,calls,store:{table:async name=>{calls.push(name);return structuredClone(tables[name]||[]);},directory:async ids=>{calls.push('directory');return [{id:'09625',name:'หน่วยบริการ fixture',type:'ประเภทตามอ้างอิง'}].filter(h=>ids.includes(h.id));}}};
}
test('live read preserves identifiers, scopes unit/year, joins database item IDs not visible numbers',async()=>{
 const {store,calls}=fixture();const m=await loadMouWorkspace(store,access,{},now);
 assert.equal(m.hospitalId,'09625');assert.equal(m.items[0].id,'101');assert.equal(m.items[0].number,'1.1');
 assert.equal(m.items[0].record.detail,'ข้อมูลในชีต');assert.equal(m.counts.completed,1);assert.equal(m.counts.percent,33);
 assert.ok(!JSON.stringify(m).includes('CANARY'));assert.ok(!calls.includes('users'));
 assert.equal(m.unit.group,'PCU');assert.equal(m.source,'google-sheets');
});

test('batched reference path preserves model and does not run before hospital authorization',async()=>{
 const {store,tables}=fixture();const expected=await loadMouWorkspace(store,access,{},now);let batches=0;
 store.tables=async names=>{batches++;return names.map(n=>structuredClone(tables[n]));};
 assert.deepEqual(await loadMouWorkspace(store,access,{},now),expected);
 await assert.rejects(loadMouWorkspace(store,access,{hospitalId:'09626'},now),/HOSPITAL_ACCESS_DENIED/);
 assert.equal(batches,1);
});
test('denied and malformed requests fail before touching reference or data sheets',async()=>{
 const {store,calls}=fixture();
 for(const query of [{hospitalId:'09626'},{hospitalId:'9625'},{year:'bad'},{year:'2569.0'},{category:'x'},{filter:'constructor'}])await assert.rejects(loadMouWorkspace(store,access,query,now));
 await assert.rejects(loadMouWorkspace(store,{status:'unlinked'}, {},now));
 await assert.rejects(loadMouWorkspace(store,admin,{hospitalId:'99999'},now),/HOSPITAL_OUTSIDE_PROJECT/);
 assert.deepEqual(calls,[]);
});
test('empty and incomplete Sheets never become synthetic records or a fabricated score',async()=>{
 const {store,calls}=fixture({mou_categories:[],mou_items:[],mou_settings:[]});store.directory=async()=>[];
 const m=await loadMouWorkspace(store,admin,{},now),html=readOnlyPage('dashboard',m);
 assert.equal(m.units.length,0);assert.ok(m.warnings.length>=2);assert.ok(!calls.includes('mou_progress'));
 assert.match(html,/รอนำเข้าข้อมูลต้นทาง/);assert.ok(!html.includes('DEMO-'));assert.ok(!html.includes('<progress'));
 assert.equal(m.settings.six,false);assert.equal(m.settings.later,false);
});
test('catalog and progress corruption fail closed instead of silently replacing or overwriting',async()=>{
 assert.throws(()=>normalizeCatalog(categories,[{...items[0],category_id:'missing'}],settings),/MOU_CATEGORY_NOT_FOUND/);
 assert.throws(()=>normalizeCatalog(categories,[items[0],items[0]],settings),/DUPLICATE_MOU_REFERENCE/);
 assert.throws(()=>normalizeCatalog(categories,items,[settings[0],settings[0]]),/DUPLICATE_MOU_REFERENCE/);
 assert.throws(()=>normalizeCatalog(categories,[{...items[0],period:'unexpected'}],settings),/INVALID_MOU_DATA/);
 const {store,tables}=fixture();tables.mou_progress.push({...tables.mou_progress[0],id:'duplicate'});
 await assert.rejects(loadMouWorkspace(store,access,{},now),/DUPLICATE_MOU_PROGRESS/);
 tables.mou_progress=[{...tables.mou_progress[0],item_id:'missing'}];await assert.rejects(loadMouWorkspace(store,access,{},now),/ORPHAN_MOU_PROGRESS/);
});
test('hospital category 6 is hidden using category number while IDs may differ',async()=>{
 const {store}=fixture({mou_agencies:[{id:'09625',user_group:'โรงพยาบาล',classification_source:'owner_confirmed',status:'confirmed'}]});const m=await loadMouWorkspace(store,access,{},now);
 assert.equal(m.items.length,2);assert.equal(m.categories.length,1);assert.equal(m.counts.percent,50);
});
test('missing agency reference never falls back to account groups or directory type',async()=>{
 const {store,calls}=fixture({mou_agencies:[],users:[{hospital_id:'09625',user_group:'โรงพยาบาล',account_status:'active'}]});
 const m=await loadMouWorkspace(store,admin,{hospitalId:'09625'},now);
 assert.equal(m.unit.group,'UNKNOWN');assert.match(m.items[0].lock,/รอตรวจประเภท/);
 assert.ok(!calls.includes('users'));
});
test('unsafe evidence, sheet markup and hidden file paths are not executed or exposed',async()=>{
 const {store,tables}=fixture();tables.mou_items=[{...items[0],title:'<script>bad()</script>'}];
 tables.mou_progress=[{...tables.mou_progress[0],assessment_detail:'<img src=x onerror=bad()>',evidence_link:'javascript:bad()',evidence_file:'/private/FILE-CANARY',admin_reviewed_by:'REVIEWER-CANARY'}];
 const m=await loadMouWorkspace(store,access,{},now),html=readOnlyPage('mou',m);
 assert.ok(html.includes('&lt;script&gt;'));assert.deepEqual(html.match(/<script\b[^>]*>[\s\S]*?<\/script>/g),['<script src="/portal-ui.js" defer></script>']);assert.ok(!html.includes('javascript:'));assert.ok(!html.includes('<img src=x'));
 assert.ok(!html.includes('FILE-CANARY'));assert.ok(!JSON.stringify(m).includes('REVIEWER-CANARY'));assert.match(html,/ลิงก์หลักฐานไม่ถูกต้อง/);
 for(const url of ['file:///secret','data:text/html,bad','https://user:pass@example.org'])assert.equal(safeEvidenceUrl(url),'');
});
test('missing rows differ from status none and both remain read-only',async()=>{
 const {store,tables}=fixture();tables.mou_progress=[{...tables.mou_progress[0],status:'none'}];
 const m=await loadMouWorkspace(store,access,{},now);
 assert.equal(m.items[0].record.status,'none');assert.equal(m.items[1].record,null);
 const html=readOnlyPage('mou',m);assert.match(html,/ยังไม่ประเมิน/);assert.match(html,/ยังไม่มีแถวผลใน Sheets/);assert.ok(!html.includes('จำลองบันทึก'));
});
test('read fiscal years and policy periods match the legacy page',()=>{
 assert.equal(currentFiscalYear(new Date('2026-09-30T16:59:59Z')),2569);assert.equal(currentFiscalYear(new Date('2026-09-30T17:00:00Z')),2570);
 const i={number:'1.1',categoryNumber:1,period:'6_months'},s={six:false,later:false};
 assert.match(legacyLock(i,'PHO',2569,s,2569),/6 เดือน/);
 assert.match(legacyLock({...i,number:'5.1',categoryNumber:5},'HOSPITAL',2569,s,2569),/CTAM/);
 assert.match(legacyLock({...i,number:'3.1',categoryNumber:3},'PCU',2569,s,2569),/ไม่ต้องประเมิน/);
 assert.match(legacyLock({...i,period:'all'},'PHO',2568,s,2569),/ปีงบประมาณ/);
});
