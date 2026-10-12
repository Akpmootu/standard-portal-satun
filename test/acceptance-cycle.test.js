import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
import {currentFiscalYear} from '../src/mou-read.js';
import {planMouWrite} from '../src/mou-write-rules.js';
import {planRegistration} from '../src/registration-rules.js';
import {reviewerFixture} from './fixtures/mou-write-data.js';

test('isolated HTTP acceptance: signup, role approval, save, reject, resubmit, approve, history and report',async t=>{
 const year=currentFiscalYear(),data=reviewerFixture(),events=[],checks=[];
 data.files=[];data.notifications=[];data.announcements=[];
 data.mou_agencies.push({id:'09611',user_group:'โรงพยาบาลส่งเสริมสุขภาพตำบล',classification_source:'legacy_export',status:'confirmed'});
 data.mou_progress.push({...data.mou_progress[0],id:'scope-canary',hospital_id:'09611',fiscal_year:year,assessment_detail:'CROSS-SCOPE-CANARY',admin_status:'approved'});
 const original=JSON.stringify(data.mou_progress);
 const config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_LOGIN_CLIENT_ID:'synthetic',GOOGLE_LOGIN_CLIENT_SECRET:'synthetic',GOOGLE_STORAGE_CLIENT_ID:'synthetic',GOOGLE_STORAGE_CLIENT_SECRET:'synthetic',GOOGLE_STORAGE_REFRESH_TOKEN:'synthetic',MOU_WRITES_ENABLED:'1',MOU_WRITER_URL:'https://script.google.com/macros/s/'+'x'.repeat(30)+'/exec',MOU_WRITER_SECRET:'b'.repeat(64)});
 const codec=sessionCodec(config);
 const store={table:async n=>structuredClone(data[n]||[]),directory:async ids=>ids.filter(id=>['09625','09611'].includes(id)).map(id=>({id,name:'หน่วยบริการสมมติ '+id}))};
 function put(table,record){const key=table==='write_requests'?'request_id':'id',index=data[table].findIndex(r=>r[key]===record[key]);if(index<0)data[table].push(record);else data[table][index]=record;}
 const writer={execute:async(identity,command,operation)=>{
  const hash=createHash('sha256').update(JSON.stringify(command)).digest('hex');
  const p=operation==='registration'?planRegistration(data,identity,command,hash):planMouWrite(data,identity,command,hash);
  if(!p.result.replayed){if(operation==='registration')for(const c of p.changes)put(c.table,c.record);else{put('mou_progress',p.next);if(p.history)put('mou_review_history',p.history);put('audit_log',p.audit);put('write_requests',p.receipt);}}
  events.push({action:command.action,operation:operation||'mou',version:p.result.version,replayed:p.result.replayed});return p.result;
 }};
 const server=createServer(createApp(config,{codec,store,writer,preview:true}));await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;
 t.after(()=>{server.closeAllConnections();server.close();});
 async function account(subject){const payload={provider:'google',subject,email:subject+'@example.test',name:'บัญชีสมมติ',csrf:'csrf-'+subject};return {cookie:(await codec.issue('session',payload,300)).cookie.split(';')[0],csrf:payload.csrf};}
 const admin=await account('admin-sub'),hospital=await account('new-hospital'),reviewer=await account('new-reviewer');
 const request=(path,who)=>fetch(config.origin+path,{redirect:'manual',headers:who?{cookie:who.cookie}:{}});
 const post=(path,who,command,csrf=who.csrf)=>fetch(config.origin+path,{method:'POST',headers:{cookie:who.cookie,Origin:config.origin,'Content-Type':'application/json'},body:JSON.stringify({csrf,...command})});
 async function accepted(response){assert.equal(response.status,200);const body=await response.json();assert.equal(body.ok,true);return body;}
 assert.equal((await request('/mou')).status,303);assert.equal((await request('/mou',hospital)).status,403);checks.push('anonymous and unapproved account denied');
 for(const [who,role] of [[hospital,'hospital'],[reviewer,'reviewer']]){
  const registered=await accepted(await post('/api/registration',who,{requestId:randomUUID(),action:'register',displayName:'ผู้สมัครสมมติ '+role,jobTitle:'ทดสอบ',organization:'หน่วยงานสมมติ',phone:'020000000'}));
  assert.equal((await request('/mou',who)).status,403);
  await accepted(await post('/api/registration',admin,{requestId:randomUUID(),action:'approve',registrationId:registered.recordId,expectedVersion:1,role,hospitalId:role==='hospital'?'09625':'',hospitalIds:role==='reviewer'?['09625']:[],fiscalYears:role==='reviewer'?[year]:[],note:'อนุมัติในระบบทดสอบเท่านั้น'}));
 }
 checks.push('signup grants no access until admin assigns role and scope');
 const view='/mou?hospital_id=09625&year='+year;
 const read=await request(view,hospital);assert.equal(read.status,200);assert.ok(!(await read.text()).includes('CROSS-SCOPE-CANARY'));
 assert.equal((await request('/mou?hospital_id=09611&year='+year,hospital)).status,403);
 assert.equal((await request('/ctam',reviewer)).status,403);
 const save={requestId:randomUUID(),action:'save',hospitalId:'09625',itemId:'1',fiscalYear:year,expectedVersion:0,status:'in_progress',detail:'ข้อมูลสมมติสำหรับทดสอบครั้งแรก',evidenceLink:'https://drive.google.com/file/d/LOCAL_TEST_ONLY/view'};
 assert.equal((await post('/api/mou/write',hospital,save,'wrong')).status,403);
 assert.equal((await post('/api/mou/write',hospital,{...save,hospitalId:'09611'})).status,403);
 assert.equal((await post('/api/mou/write',reviewer,save)).status,403);
 const first=await accepted(await post('/api/mou/write',hospital,save));assert.equal(first.version,1);
 const replay=await accepted(await post('/api/mou/write',hospital,save));assert.equal(replay.replayed,true);assert.equal(replay.version,1);checks.push('CSRF and scope enforced; retry does not duplicate save');
 const review={requestId:randomUUID(),action:'review',hospitalId:'09625',itemId:'1',fiscalYear:year,expectedVersion:1,reviewStatus:'rejected',comment:'กรุณาเพิ่มรายละเอียดในข้อมูลทดสอบ'};
 assert.equal((await post('/api/mou/write',hospital,review)).status,403);
 assert.equal((await post('/api/mou/write',reviewer,{...review,fiscalYear:year+1})).status,403);
 assert.equal((await accepted(await post('/api/mou/write',reviewer,review))).version,2);
 assert.ok((await (await request(view,hospital)).text()).includes(review.comment));
 assert.equal((await post('/api/mou/write',hospital,{...save,requestId:randomUUID(),expectedVersion:1})).status,409);
 const resubmit={...save,requestId:randomUUID(),expectedVersion:2,status:'completed',detail:'ข้อมูลสมมติแก้ไขแล้ว — ใช้ตรวจระบบเท่านั้น'};
 assert.equal((await accepted(await post('/api/mou/write',hospital,resubmit))).version,3);
 let target=data.mou_progress.find(r=>r.id===first.recordId);assert.equal(target.admin_status,'pending');assert.equal(target.admin_comment,'');assert.equal(data.mou_review_history.length,1);checks.push('reject, stale-version conflict and resubmit preserve history');
 const approval={...review,requestId:randomUUID(),expectedVersion:3,reviewStatus:'approved',comment:'ผ่านการทดสอบระบบสมมติ'};
 assert.equal((await accepted(await post('/api/mou/write',reviewer,approval))).version,4);
 target=data.mou_progress.find(r=>r.id===first.recordId);assert.equal(target.admin_status,'approved');assert.equal(target.assessment_detail,resubmit.detail);
 const history=await request('/mou/history?hospital_id=09625&year='+year,reviewer);assert.equal(history.status,200);const historyHtml=await history.text();assert.ok(historyHtml.includes(review.comment));assert.ok(historyHtml.includes(approval.comment));assert.equal(data.mou_review_history.length,2);
 const report=await request('/reports?module=mou&hospital_id=09625&year='+year,hospital);assert.equal(report.status,200);assert.match(await report.text(),/ตรวจอนุมัติ 1 ข้อ/);
 const csv=await request('/reports.csv?module=mou&hospital_id=09625&year='+year,hospital);assert.equal(csv.status,200);const csvText=await csv.text();assert.ok(csvText.includes(resubmit.detail));assert.ok(!csvText.includes('CROSS-SCOPE-CANARY'));checks.push('approval, two history events, scoped HTML report and CSV match');
 assert.equal(JSON.stringify(data.mou_progress.filter(r=>r.id!==first.recordId)),original);checks.push('pre-existing fixture assessment unchanged');
 const linked=data.identities.find(i=>i.provider_subject==='new-hospital');data.users.find(u=>u.id===linked.legacy_user_id).account_status='disabled';assert.equal((await request(view,hospital)).status,403);checks.push('account disable immediately denies existing session');
 assert.equal(data.write_requests.filter(r=>r.record_type==='mou').length,4);
 if(process.env.PORTAL_UAT_REPORT)await writeFile(process.env.PORTAL_UAT_REPORT,JSON.stringify({environment:'isolated-synthetic-http',googleAccess:false,productionWrites:false,year,checks,events,mouFinalVersion:target._version,historyEvents:2,mouWriteReceipts:4},null,2));
});
