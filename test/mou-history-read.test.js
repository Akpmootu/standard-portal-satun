import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {loadMouHistory} from '../src/mou-history-read.js';
import {readOnlyPage} from '../src/read-only-page.js';
import {parseTable} from '../src/google-store.js';
import {MOU_HISTORY_HEADERS} from '../src/mou-history-import-plan.js';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';

const admin={status:'active',user:{id:'u1',role:'admin'}};
const now=new Date('2026-09-07T00:00:00Z');
function fixture() {
  const data={
    identities:[{provider:'google',provider_subject:'subject',legacy_user_id:'u1',status:'active',approved_by:'owner',approved_at:'2026-09-04'}],
    users:[{id:'u1',role:'admin',account_status:'active'}],
    mou_items:[{id:'1',item_number:'1.1',title:'หัวข้อทดสอบ'}],
    mou_progress:[{id:'p1',hospital_id:'09625',item_id:'1',fiscal_year:2569,admin_status:'pending',updated_at:'2026-09-04 12:00:00'},
      {id:'p2',hospital_id:'09626',item_id:'1',fiscal_year:2569,admin_status:'approved',updated_at:''},
      {id:'p3',hospital_id:'09625',item_id:'1',fiscal_year:2568,admin_status:'rejected',updated_at:''}],
    mou_review_history:[{id:'h1',progress_id:'p1',admin_status:'rejected',admin_comment:'แก้ไขข้อมูล',admin_reviewed_by:'legacy:ผู้ตรวจทดสอบ',created_at:'2026-03-01 10:00:00'},
      {id:'h2',progress_id:'p1',admin_status:'approved',admin_comment:'',admin_reviewed_by:'',created_at:'2026-03-02 10:00:00'},
      {id:'h3',progress_id:'p2',admin_status:'approved',admin_comment:'OTHER-HOSPITAL-CANARY',admin_reviewed_by:'',created_at:'2026-03-02 10:00:00'},
      {id:'h4',progress_id:'p3',admin_status:'rejected',admin_comment:'OTHER-YEAR-CANARY',admin_reviewed_by:'',created_at:'2025-03-02 10:00:00'}],
  };
  const calls=[];
  return {data,calls,store:{table:async n=>{calls.push(n);return structuredClone(data[n]);},directory:async()=>[{id:'09625',name:'หน่วยทดสอบ'},{id:'09626',name:'อีกหน่วย'}]}};
}
test('history scope and chronology never rewrite current pending state',async()=>{
  const {data,store}=fixture(),before=JSON.stringify(data);
  const m=await loadMouHistory(store,admin,{hospitalId:'09625',year:'2569'},now);
  assert.equal(m.events.length,2);assert.equal(m.events[0].id,'h2');assert.equal(m.events[0].currentReview,'pending');
  assert.deepEqual(m.counts,{total:2,approved:1,rejected:1,pendingParents:1});
  assert.ok(!JSON.stringify(m).includes('CANARY'));assert.equal(JSON.stringify(data),before);
  const html=readOnlyPage('mou/history',m);
  assert.match(html,/สถานะปัจจุบันของข้อประเมิน/);assert.match(html,/รอตรวจสอบ/);
  assert.match(html,/ผู้ตรวจทดสอบ \(ระบบเดิม\)/);assert.ok(!html.includes('legacy:'));
});
test('non-admin and malformed history queries fail before data reads',async()=>{
  const {store,calls}=fixture();
  for(const access of [{status:'unlinked'},{status:'active',user:{role:'hospital',hospitalId:'09625'}}])await assert.rejects(loadMouHistory(store,access,{},now),/ADMIN_REQUIRED/);
  for(const query of [{hospitalId:'99999'},{year:'2569.0'},{year:'NaN'},{page:'0'},{page:'1.5'},{progressId:'../private'},{review:'constructor'}])await assert.rejects(loadMouHistory(store,admin,query,now));
  assert.deepEqual(calls,[]);
});
test('progress lookup cannot escape selected unit or fiscal year',async()=>{
  const {store,calls}=fixture();
  for(const progressId of ['p2','p3','missing'])await assert.rejects(loadMouHistory(store,admin,{hospitalId:'09625',year:'2569',progressId},now),/PROGRESS_NOT_FOUND/);
  assert.ok(calls.every(n=>n==='mou_progress'));
});
test('history validates corruption and schema instead of showing fabricated results',async()=>{
  assert.equal(parseTable('mou_review_history',[MOU_HISTORY_HEADERS,['h1','p1','approved','','','2026-03-01 00:00:00',1,'req']]).length,1);
  assert.throws(()=>parseTable('mou_review_history',[['wrong']]),/SCHEMA_MISMATCH/);
  const {store,data}=fixture();
  data.mou_review_history[0].progress_id='missing';await assert.rejects(loadMouHistory(store,admin,{},now),/ORPHAN_MOU_HISTORY/);
  data.mou_review_history[0].progress_id='p1';data.mou_review_history[0].created_at='2026-02-30 00:00:00';await assert.rejects(loadMouHistory(store,admin,{},now),/INVALID_MOU_HISTORY/);
  data.mou_review_history[0].created_at='2026-03-01 00:00:00';data.mou_review_history.push({...data.mou_review_history[0]});await assert.rejects(loadMouHistory(store,admin,{},now),/INVALID_MOU_HISTORY/);
});
test('history pagination, filters, empty years and HTML escaping work',async()=>{
  const {store,data}=fixture();
  data.mou_review_history=Array.from({length:26},(_,i)=>({...data.mou_review_history[0],id:'h'+i,admin_comment:'<img src=x onerror=bad()>\nสองบรรทัด'}));
  let m=await loadMouHistory(store,admin,{hospitalId:'09625',page:'2'},now);assert.equal(m.events.length,1);assert.equal(m.pages,2);
  let html=readOnlyPage('mou/history',m);assert.match(html,/&lt;img/);assert.ok(!html.includes('<img'));assert.match(html,/page=1/);
  await assert.rejects(loadMouHistory(store,admin,{page:'3'},now),/PAGE_NOT_FOUND/);
  m=await loadMouHistory(store,admin,{year:'2570'},now);assert.equal(m.counts.total,0);assert.match(readOnlyPage('mou/history',m),/ไม่พบประวัติตามตัวกรองนี้/);
  m=await loadMouHistory(store,admin,{review:'approved'},now);assert.equal(m.events.length,0);assert.equal(m.counts.total,26);
});
test('HTTP history authorizes each request and protects both HTML and API',async t=>{
  const {store,data,calls}=fixture();
  const config=readConfig({SESSION_KEY_HEX:randomBytes(32).toString('hex'),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake'});
  const codec=sessionCodec(config),server=createServer(createApp(config,{codec,store}));
  await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;
  t.after(()=>{server.closeAllConnections();server.close();});
  const req=(path,options={})=>fetch(config.origin+path,{redirect:'manual',...options});
  assert.equal((await req('/api/admin/mou-history')).status,401);assert.equal((await req('/mou/history')).status,303);assert.deepEqual(calls,[]);
  const issued=await codec.issue('session',{provider:'google',subject:'subject'},60),headers={cookie:issued.cookie.split(';')[0]};
  let res=await req('/mou/history?hospital_id=09625&year=2569',{headers});assert.equal(res.status,200);assert.match(await res.text(),/ประวัติการตรวจ MOU/);
  res=await req('/api/admin/mou-history?hospital_id=09625&year=2569',{headers});assert.equal(res.status,200);assert.equal((await res.json()).events.length,2);assert.equal(res.headers.get('cache-control'),'no-store');
  assert.equal((await req('/mou/history?year=2569&year=2568',{headers})).status,400);
  data.users[0].role='hospital';data.users[0].hospital_id='09625';calls.length=0;
  for(const path of ['/mou/history','/api/admin/mou-history'])assert.equal((await req(path,{headers})).status,403);
  assert.ok(calls.every(n=>['users','identities'].includes(n)));
  assert.equal((await req('/api/admin/mou-history',{headers,method:'POST'})).status,405);
  data.users[0].role='admin';store.table=async n=>{if(n==='mou_review_history')throw Error('SECRET-CANARY');return structuredClone(data[n]);};
  res=await req('/mou/history',{headers});assert.equal(res.status,503);const html=await res.text();assert.ok(!html.includes('SECRET-CANARY'));assert.match(html,/ยังอ่านข้อมูลจาก Sheets ไม่สำเร็จ/);
});
