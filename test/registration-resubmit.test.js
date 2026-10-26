import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {planRegistration,normalizeRegistrationCommand} from '../src/registration-rules.js';
import {registrationPage,registrationAdminPage} from '../src/registration-page.js';
import {reviewerFixture} from './fixtures/mou-write-data.js';
const who={provider:'google',subject:'new-sub',email:'applicant@example.test'},admin={provider:'google',subject:'admin-sub'},time=new Date('2026-10-26T02:00:00Z');
const hash=c=>createHash('sha256').update(JSON.stringify(normalizeRegistrationCommand(c))).digest('hex');
const commit=(data,p)=>{for(const c of p.changes||[]){const key=c.table==='write_requests'?'request_id':'id';data[c.table]=data[c.table].filter(r=>!c.existing||r[key]!==c.record[key]).concat(c.record);}};
function setup(){const data=reviewerFixture(),signup={requestId:randomUUID(),action:'register',displayName:'ผู้สมัคร เดิม',jobTitle:'ตำแหน่งเดิม',organization:'09625',phone:'0200000000'};commit(data,planRegistration(data,who,signup,hash(signup),time));const id=data.registration_requests[0].id,reject={requestId:randomUUID(),action:'reject',registrationId:id,expectedVersion:1,role:'hospital',hospitalId:'09625',hospitalIds:[],fiscalYears:[],note:'โปรดแก้ตำแหน่ง'};commit(data,planRegistration(data,admin,reject,hash(reject),time));const resubmit={...signup,action:'resubmit',requestId:randomUUID(),registrationId:id,expectedVersion:2,jobTitle:'ตำแหน่งใหม่',organization:'09611',phone:'0212345678'};return {data,resubmit,reject};}
test('rejected application resubmits in place, preserves decision/profile snapshots and grants no access',()=>{
 const {data,resubmit}=setup(),before=structuredClone(data),p=planRegistration(data,who,resubmit,hash(resubmit),time);commit(data,p);const row=data.registration_requests[0];
 assert.equal(row.id,resubmit.registrationId);assert.equal(row.status,'pending');assert.equal(row._version,3);assert.equal(row.job_title,'ตำแหน่งใหม่');assert.equal(row.organization,'09611');assert.equal(row.email,who.email);assert.equal(row.decision_note,'');assert.equal(row.decided_by,'');assert.equal(row.assigned_role,'');assert.equal(data.registration_requests.length,1);
 for(const table of ['users','identities','reviewer_profiles'])assert.deepEqual(data[table],before[table]);
 const audit=data.audit_log.find(r=>r.action==='resubmit'),detail=JSON.parse(audit.changed_fields);assert.equal(detail.before.status,'rejected');assert.equal(detail.before.decision_note,'โปรดแก้ตำแหน่ง');assert.equal(detail.before.job_title,'ตำแหน่งเดิม');assert.equal(detail.after.status,'pending');assert.equal(detail.after.job_title,'ตำแหน่งใหม่');
 assert.equal(planRegistration(data,who,resubmit,hash(resubmit),time).replayed,true);assert.equal(data.audit_log.length,before.audit_log.length+1);
 const approve={...setup().reject,requestId:randomUUID(),action:'approve',registrationId:row.id,expectedVersion:3,note:'ตรวจข้อมูลใหม่แล้ว',hospitalId:'09611'};commit(data,planRegistration(data,admin,approve,hash(approve),time));assert.equal(data.registration_requests[0].status,'approved');assert.equal(data.users.at(-1).hospital_id,'09611');
});
test('resubmit rejects another subject, stale decisions, pending/approved states and role/email injection',()=>{
 const {data,resubmit}=setup();assert.throws(()=>planRegistration(data,{...who,subject:'other-sub'},resubmit,hash(resubmit),time),/REGISTRATION_OWNER_REQUIRED/);assert.throws(()=>planRegistration(data,admin,resubmit,hash(resubmit),time),/REGISTRATION_OWNER_REQUIRED/);
 assert.throws(()=>planRegistration(data,who,{...resubmit,expectedVersion:1},hash({...resubmit,expectedVersion:1}),time),/VERSION_CONFLICT/);
 for(const status of ['pending','approved']){const copy=structuredClone(data);copy.registration_requests[0].status=status;assert.throws(()=>planRegistration(copy,who,resubmit,hash(resubmit),time),/REGISTRATION_RESUBMIT_DENIED/);}
 for(const extra of [{role:'admin'},{email:'forged@example.test'},{provider_subject:'other-sub'}])assert.throws(()=>normalizeRegistrationCommand({...resubmit,...extra}),/INVALID_REGISTRATION/);
 const changed={...resubmit,phone:'123'};assert.throws(()=>normalizeRegistrationCommand(changed),/REGISTRATION_PHONE_REQUIRED/);
});
test('rejected form prefills profile, locks verified email, shows own history and does not expose other applicants',()=>{
 const {data}=setup(),other={...data.registration_requests[0],id:'other',provider_subject:'other-sub',display_name:'PRIVATE OTHER',decision_note:'PRIVATE NOTE'};data.registration_requests.push(other);data.audit_log.push({record_type:'registration',record_id:'other',action:'reject',created_at:'2026-10-26 09:00:00',changed_fields:JSON.stringify({after:other})});
 const options={csrf:'x',enabled:true,units:[{id:'09625',name:'หน่วยบริการสมมติ',registrations:1}],history:data.audit_log},html=registrationPage(who,data.registration_requests,options);
 assert.match(html,/name="action" value="resubmit"/);assert.match(html,/name="expectedVersion" value="2"/);assert.match(html,/ส่งคำขอให้พิจารณาใหม่/);assert.match(html,/โปรดแก้ตำแหน่ง/);assert.match(html,/value="ตำแหน่งเดิม"/);assert.match(html,/value="applicant@example.test" readonly/);assert.equal((html.match(/data-phone-digit/g)||[]).length,10);assert.ok(!html.includes('PRIVATE OTHER'));assert.ok(!html.includes('PRIVATE NOTE'));
 for(const status of ['pending','approved']){const row={...data.registration_requests[0],status};assert.ok(!registrationPage(who,[row],options).includes('name="action" value="resubmit"'));}
 const adminHtml=registrationAdminPage(data.registration_requests,options.units,options);assert.match(adminHtml,/ประวัติการพิจารณา/);
});
import {createServer} from 'node:http';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
test('HTTP resubmit accepts the unlinked owner, preserves CSRF and unit checks, and isolates history',async t=>{
 const {data,resubmit}=setup(),config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake'});config.writer={enabled:true,url:'fake',secret:'fake'};const codec=sessionCodec(config);let writes=0;
 data.audit_log.push({record_type:'registration',record_id:'other',action:'reject',changed_fields:JSON.stringify({after:{display_name:'PRIVATE_HISTORY_CANARY',decision_note:'PRIVATE_REASON_CANARY'}})});
 const store={table:async n=>structuredClone(data[n]||[]),directory:async ids=>ids.filter(id=>id==='09625'||id==='09611').map(id=>({id,name:'หน่วยบริการสมมติ'}))};
 const server=createServer(createApp(config,{codec,store,writer:{execute:async(identity,c)=>{writes++;const plan=planRegistration(data,identity,c,hash(c),time);commit(data,plan);return plan.result;}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close();});
 const cookie=async identity=>(await codec.issue('session',{...identity,csrf:'token'},900)).cookie.split(';')[0],own=await cookie(who),other=await cookie({...who,subject:'other-sub'});
 const html=await(await fetch(config.origin+'/register',{headers:{cookie:own}})).text();assert.match(html,/ส่งคำขอให้พิจารณาใหม่/);assert.match(html,/โปรดแก้ตำแหน่ง/);assert.ok(!html.includes('PRIVATE_HISTORY_CANARY'));assert.ok(!html.includes('PRIVATE_REASON_CANARY'));
 const post=(cmd=resubmit,token='token',session=own,origin=config.origin)=>fetch(config.origin+'/api/registration',{method:'POST',headers:{origin,cookie:session,'Content-Type':'application/json'},body:JSON.stringify({...cmd,csrf:token})});
 assert.equal((await post(resubmit,'wrong')).status,403);assert.equal((await post(resubmit,'token',own,'https://evil.example')).status,403);assert.equal(writes,0);
 assert.equal((await post(resubmit,'token',other)).status,403);assert.equal((await post({...resubmit,organization:'09626'})).status,400);assert.equal((await post()).status,200);assert.equal(data.registration_requests[0].status,'pending');assert.equal((await post()).status,200);assert.equal(data.registration_requests.length,1);
 const pending=await(await fetch(config.origin+'/register',{headers:{cookie:own}})).text();assert.match(pending,/รอแอดมินอนุมัติ/);assert.ok(!pending.includes('name="action" value="resubmit"'));
});
