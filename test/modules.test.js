import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {writeFixture,reviewerFixture} from './fixtures/mou-write-data.js';
import {normalizeModuleCommand,planModuleWrite} from '../src/module-rules.js';
import {loadModule,modulePage} from '../src/module-page.js';
import {remainingImportPlan} from '../src/remaining-import-plan.js';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
function fixture(){const t=reviewerFixture();t.mou_agencies.push({id:'11402',user_group:'โรงพยาบาล',classification_source:'owner_confirmed',status:'confirmed'});t.users[0].hospital_id='11402';return {...t,ctam_items:[{id:'1',item_number:'1',title:'หัวข้อทดสอบ',sort_order:1}],ctam_progress:[],ctam_review_history:[],rg12_sub_items:[{id:'1',chapter_id:'1',item_text:'หัวข้อทดสอบ',sort_order:1}],rg12_chapters:[{id:'1',chapter_number:1,title:'หมวดทดสอบ',sort_order:1}],rg12_progress:[],hait_review_history:[]};}
const identity=subject=>({provider:'google',subject});
const sha='a'.repeat(64);
const command=(module='ctam')=>({requestId:randomUUID(),module,action:'save',hospitalId:'11402',itemId:'1',expectedVersion:0,status:'completed',responsiblePerson:'ผู้รับผิดชอบทดสอบ',detail:'ดำเนินการแล้ว',evidenceLink:'https://example.org/evidence'});
function commit(t,plan){for(const c of plan.changes){const key=c.table==='write_requests'?'request_id':'id';const rows=t[c.table];const i=rows.findIndex(r=>r[key]===c.record[key]);if(i>=0)rows[i]=c.record;else rows.push(c.record);}}
for(const module of ['ctam','hait']){
 test(module+' saves, reviews, rejects and resubmits atomically with persistent history',()=>{
  const t=fixture(),c=command(module),p=planModuleWrite(t,identity('hospital-sub'),c,sha);assert.equal(p.changes.length,3);commit(t,p);
  assert.equal(planModuleWrite(t,identity('hospital-sub'),c,sha).result.replayed,true);
  const review={requestId:randomUUID(),module,action:'review',hospitalId:'11402',itemId:'1',expectedVersion:1,reviewStatus:'rejected',comment:'กรุณาแก้ไข'};
  const r=planModuleWrite(t,identity('admin-sub'),review,sha);assert.equal(r.changes.length,4);commit(t,r);
  const next=planModuleWrite(t,identity('hospital-sub'),{...c,requestId:randomUUID(),expectedVersion:2},sha);commit(t,next);
  const table=module==='ctam'?'ctam_progress':'rg12_progress',history=module==='ctam'?'ctam_review_history':'hait_review_history';
  assert.equal(t[table][0].admin_status,'pending');assert.equal(t[table][0].admin_comment,'');assert.equal(t[history].length,1);assert.equal(t[table][0]._version,3);
  if(module==='hait')assert.equal(t[table][0].is_completed,1);
 });
 test(module+' rejects cross unit, reviewer scope expansion, conflicts and incomplete evidence',()=>{
  const t=fixture(),c=command(module);
  assert.throws(()=>planModuleWrite(t,identity('hospital-sub'),{...c,hospitalId:'11403'},sha),{code:'HOSPITAL_ACCESS_DENIED'});
  assert.throws(()=>planModuleWrite(t,identity('reviewer-sub'),c,sha),{code:'HOSPITAL_ACCESS_DENIED'});
  assert.throws(()=>planModuleWrite(t,identity('hospital-sub'),{...c,responsiblePerson:''},sha),{code:'RESPONSIBLE_PERSON_REQUIRED'});
  assert.throws(()=>planModuleWrite(t,identity('hospital-sub'),{...c,evidenceLink:''},sha),{code:'EVIDENCE_REQUIRED'});
  const p=planModuleWrite(t,identity('hospital-sub'),c,sha);commit(t,p);
  assert.throws(()=>planModuleWrite(t,identity('hospital-sub'),{...c,requestId:randomUUID()},sha),{code:'VERSION_CONFLICT'});
  assert.throws(()=>planModuleWrite(t,identity('hospital-sub'),c,'b'.repeat(64)),{code:'REQUEST_ID_REUSED'});
 });
}
test('module pages escape content and contain only the approved hospital',async()=>{
 const t=fixture();t.ctam_items[0].title='<script>alert(1)</script>';
 const store={table:async n=>t[n],directory:async ids=>ids.map(id=>({id,name:'โรงพยาบาลทดสอบ'}))};
 const m=await loadModule(store,{status:'active',user:{role:'hospital',hospitalId:'11402'}},'ctam','');const html=modulePage(m,true);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);assert.equal(m.units.length,1);
 await assert.rejects(loadModule(store,{status:'active',user:{role:'reviewer',hospitalId:''}},'ctam','11402'),{code:'MODULE_SCOPE_REQUIRED'});
});
test('migration rejects orphan history, unsafe paths, and duplicate progress',()=>{
 const s={format:'standard-portal-remaining-v1',source:{read_only:true},tables:{ctam_items:[{id:'1'}],rg12_chapters:[],rg12_sub_items:[],ctam_progress:[{id:'1',hospital_id:'11402',item_id:'1',status:'completed'}],rg12_progress:[],ctam_review_history:[{id:'1',progress_id:'99',admin_status:'approved'}]}};
 assert.throws(()=>remainingImportPlan(s),{code:'ORPHAN_HISTORY'});s.tables.ctam_review_history=[];s.tables.ctam_progress[0].evidence_file='../private.pdf';assert.throws(()=>remainingImportPlan(s),{code:'UNSAFE_LEGACY_FILE'});
 s.tables.ctam_progress[0].evidence_file='';s.tables.ctam_progress.push({...s.tables.ctam_progress[0],id:'2'});assert.throws(()=>remainingImportPlan(s),{code:'DUPLICATE_PROGRESS'});
});
test('module HTTP gates, CSRF, unauthorized reads and response codes',async t=>{
 const data=fixture(),config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_LOGIN_CLIENT_ID:'fake',GOOGLE_LOGIN_CLIENT_SECRET:'fake',GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake',MOU_WRITES_ENABLED:'1',MOU_WRITER_URL:'https://script.google.com/macros/s/'+'x'.repeat(30)+'/exec',MOU_WRITER_SECRET:'b'.repeat(64),MODULE_WRITES_ENABLED:'1'});
 const codec=sessionCodec(config),writer={execute:async(i,c,op)=>{assert.equal(op,'assessment');return planModuleWrite(data,i,c,sha).result;}};
 const server=createServer(createApp(config,{codec,store:{table:async n=>data[n],directory:async ids=>ids.map(id=>({id,name:'ทดสอบ'}))},writer}));await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close();});
 const request=(p,o={})=>fetch(config.origin+p,{redirect:'manual',...o});assert.equal((await request('/ctam')).status,303);
 const cookie=(await codec.issue('session',{...identity('hospital-sub'),csrf:'csrf'},60)).cookie.split(';')[0];
 assert.equal((await request('/ctam',{headers:{cookie}})).status,200);
 assert.equal((await request('/hait?hospital_id=11403',{headers:{cookie}})).status,403);
 const options={method:'POST',headers:{cookie,Origin:config.origin,'Content-Type':'application/json'},body:JSON.stringify({...command(),csrf:'wrong'})};assert.equal((await request('/api/assessment/write',options)).status,403);
 options.body=JSON.stringify({...command(),csrf:'csrf'});assert.equal((await request('/api/assessment/write',options)).status,200);
 config.moduleWrites=false;assert.equal((await request('/api/assessment/write',options)).status,503);
});
