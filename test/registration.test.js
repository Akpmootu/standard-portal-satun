import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {reviewerFixture} from './fixtures/mou-write-data.js';
import {normalizeRegistrationCommand,planRegistration} from '../src/registration-rules.js';
import {resolveAccess} from '../src/authorization.js';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
const who={provider:'google',subject:'new-sub',email:'applicant@example.test'},admin={provider:'google',subject:'admin-sub'},now=new Date('2026-09-07T00:00:00Z');
const register=(x={})=>({requestId:randomUUID(),action:'register',displayName:'ผู้สมัคร ทดสอบ',jobTitle:'นักวิชาการ',organization:'09625',phone:'0200000000',...x});
const hash=c=>createHash('sha256').update(JSON.stringify(normalizeRegistrationCommand(c))).digest('hex');
function commit(t,p){for(const c of p.changes)t[c.table]=t[c.table].filter(r=>!c.existing||r.id!==c.record.id).concat(c.record);}
function setup(){const data=reviewerFixture(),c=register(),p=planRegistration(data,who,c,hash(c),now);commit(data,p);const approve=(x={})=>({requestId:randomUUID(),action:'approve',registrationId:p.result.recordId,expectedVersion:1,role:'reviewer',hospitalId:'',hospitalIds:['09625'],fiscalYears:[2569],note:'',...x});return {data,c,approve};}
test('signup binds verified identity and grants no account; rejects role/email injection and duplicate signup',async()=>{
 const {data,c}=setup();assert.equal(data.users.length,3);assert.equal(data.identities.length,3);assert.equal(data.registration_requests[0].provider_subject,who.subject);assert.equal(data.registration_requests[0].status,'pending');
 assert.equal((await resolveAccess(who,{table:async n=>data[n]})).status,'unlinked');
 assert.equal(planRegistration(data,who,c,hash(c),now).replayed,true);
 assert.throws(()=>normalizeRegistrationCommand(register({role:'admin'})),/INVALID_REGISTRATION/);
 assert.throws(()=>normalizeRegistrationCommand(register({email:'admin@example.test'})),/INVALID_REGISTRATION/);
 const duplicate=register();assert.throws(()=>planRegistration(data,who,duplicate,hash(duplicate),now),/REGISTRATION_EXISTS/);
});
test('admin approval commits identity, account, profile and decision together; reviewer cannot approve users',async()=>{
 const {data,approve}=setup(),c=approve();
 assert.throws(()=>planRegistration(data,{provider:'google',subject:'reviewer-sub'},c,hash(c),now),/ADMIN_REQUIRED/);
 assert.throws(()=>planRegistration(data,who,c,hash(c),now),/APPROVAL_REQUIRED/);
 const p=planRegistration(data,admin,c,hash(c),now);assert.equal(p.changes.length,6);commit(data,p);
 const access=await resolveAccess(who,{table:async n=>data[n]});assert.equal(access.user.role,'reviewer');assert.deepEqual(access.user.reviewProfile.hospitalIds,['09625']);assert.equal(access.user.reviewProfile.name,'ผู้สมัคร ทดสอบ');
 assert.equal(data.registration_requests[0].decided_by,'u2');assert.equal(planRegistration(data,admin,c,hash(c),now).replayed,true);
 assert.throws(()=>planRegistration(data,admin,approve(),hash(approve()),now),/VERSION_CONFLICT/);
 data.users[1].account_status='disabled';assert.throws(()=>planRegistration(data,admin,c,hash(c),now),/ACCOUNT_DISABLED/);
});
test('approval validates scopes and rejection leaves accounts untouched',()=>{
 const {data,approve}=setup();assert.throws(()=>normalizeRegistrationCommand(approve({hospitalIds:[]})),/REVIEW_SCOPE_REQUIRED/);
 assert.throws(()=>normalizeRegistrationCommand(approve({role:'hospital',hospitalId:'xxxxx',hospitalIds:[],fiscalYears:[]})),/INVALID_HOSPITAL_MAPPING/);
 assert.throws(()=>normalizeRegistrationCommand(approve({action:'reject'})),/REJECTION_NOTE_REQUIRED/);
 const c=approve({action:'reject',note:'ข้อมูลไม่ครบ'});commit(data,planRegistration(data,admin,c,hash(c),now));assert.equal(data.users.length,3);assert.equal(data.registration_requests[0].status,'rejected');
});
test('existing account signup cannot replace its role or identity',()=>{
 const data=reviewerFixture(),c=register();const whoAdmin={...admin,email:'existing@example.test'};const p=planRegistration(data,whoAdmin,c,hash(c),now);commit(data,p);
 const change={requestId:randomUUID(),action:'approve',registrationId:p.result.recordId,expectedVersion:1,role:'hospital',hospitalId:'09625',hospitalIds:[],fiscalYears:[],note:''};
 assert.throws(()=>planRegistration(data,admin,change,hash(change),now),/EXISTING_ACCOUNT_REVIEW_REQUIRED/);assert.equal(data.users[1].role,'admin');
});
test('registration HTTP hides other applications and guards admin actions, CSRF and Origin',async t=>{
 const {data,approve}=setup();let writes=0;
 data.registration_requests.push({...data.registration_requests[0],id:'other',provider_subject:'other-sub',display_name:'PRIVATE OTHER'});
 const config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake'});config.writer={enabled:true,url:'fake',secret:'fake'};const codec=sessionCodec(config);
 const server=createServer(createApp(config,{codec,store:{table:async n=>data[n],directory:async ids=>ids.map(id=>({id,name:'หน่วยบริการสมมติ '+id}))},writer:{execute:async(identity,c,operation)=>{assert.equal(operation,'registration');writes++;return {ok:true};}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close();});
 const cookie=(await codec.issue('session',{...who,csrf:'token'},900)).cookie.split(';')[0];
 const page=await fetch(config.origin+'/register',{headers:{cookie}});const html=await page.text();assert.equal(page.status,200);assert.ok(!html.includes('PRIVATE OTHER'));
 assert.equal((await fetch(config.origin+'/admin/registrations',{headers:{cookie}})).status,403);
 const post=(c,overrides={})=>fetch(config.origin+'/api/registration',{method:'POST',headers:{cookie,origin:config.origin,'Content-Type':'application/json',...overrides},body:JSON.stringify({...c,csrf:'token'})});
 assert.equal((await post(approve())).status,403);assert.equal((await post(register(),{origin:'https://evil.test'})).status,403);assert.equal((await post(register(),{cookie:''})).status,401);assert.equal(writes,0);
 assert.equal((await post(register())).status,200);assert.equal(writes,1);
});
import {registrationUnits} from '../src/registration-units.js';
import {registrationPage} from '../src/registration-page.js';
test('registration requires a full name, a Satun unit code and exactly ten phone digits',()=>{
 for(const phone of ['012345678','01234567890','012-345678','+6612345678','abcdefghij'])assert.throws(()=>normalizeRegistrationCommand(register({phone})),/REGISTRATION_PHONE_REQUIRED/);
 assert.throws(()=>normalizeRegistrationCommand(register({displayName:'ชื่ออย่างเดียว'})),/REGISTRATION_FULL_NAME_REQUIRED/);
 for(const organization of ['99999','โรงพยาบาลนอกจังหวัด','09625 · forged name'])assert.throws(()=>normalizeRegistrationCommand(register({organization})),/REGISTRATION_UNIT_REQUIRED/);
 assert.throws(()=>normalizeRegistrationCommand(register({jobTitle:'  '})),/INVALID_REGISTRATION/);
 assert.equal(normalizeRegistrationCommand(register({phone:'0123456789'})).phone,'0123456789');
});
test('unit counts deduplicate accounts, include all request statuses and never expose applicants',()=>{
 const units=[{id:'09625',name:'หน่วยบริการหนึ่ง'},{id:'09611',name:'หน่วยบริการสอง'}];
 const rows=[{id:'1',provider:'google',provider_subject:'a',organization:'09625',status:'pending',email:'PRIVATE'},{id:'2',provider:'google',provider_subject:'a',organization:'09625',status:'approved'},{id:'3',provider:'google',provider_subject:'b',organization:'หน่วยบริการหนึ่ง',status:'rejected'},{id:'4',provider:'google',provider_subject:'c',organization:'แผนกเดิม',hospital_id:'09611'},{id:'5',provider:'google',provider_subject:'d',organization:'ไม่ทราบหน่วยบริการ'}];
 const result=registrationUnits(rows,units);assert.equal(result[0].registrations,2);assert.equal(result[1].registrations,1);assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.deepEqual(Object.keys(result[0]),['id','name','registrations']);assert.throws(()=>registrationUnits(rows,[{id:'99999',name:'นอกจังหวัด'}]),/INVALID_REGISTRATION_DIRECTORY/);
});
test('signup form has ten required phone cells, separate names and a locked Google email without a submitted email field',()=>{
 const html=registrationPage(who,[],{csrf:'x',enabled:true,units:[{id:'09625',name:'หน่วยบริการสมมติ',registrations:2}]});
 assert.equal((html.match(/data-phone-digit/g)||[]).length,10);assert.equal((html.match(/pattern="\[0-9\]" maxlength="1" required/g)||[]).length,10);assert.match(html,/data-first-name maxlength="60" required/);assert.match(html,/data-last-name maxlength="60" required/);assert.match(html,/type="email" value="applicant@example.test" readonly/);assert.ok(!html.includes('name="email"'));assert.match(html,/data-registrations="2"/);
});
test('registration directory requires sign-in and rejects unavailable units before any signed write',async t=>{
 const config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake'});config.writer={enabled:true,url:'fake',secret:'fake'};const codec=sessionCodec(config),data=reviewerFixture();data.registration_requests=[{id:'r1',provider:'google',provider_subject:'other',organization:'09625',email:'PRIVATE',display_name:'PRIVATE',phone:'PRIVATE'}];let writes=0;
 const server=createServer(createApp(config,{codec,store:{table:async n=>data[n]||[],directory:async ids=>ids.includes('09625')?[{id:'09625',name:'หน่วยบริการสมมติ'}]:[]},writer:{execute:async()=>{writes++;return {ok:true};}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close();});const cookie=(await codec.issue('session',{...who,csrf:'token'},600)).cookie.split(';')[0];
 assert.equal((await fetch(config.origin+'/api/registration/units')).status,401);const response=await fetch(config.origin+'/api/registration/units',{headers:{cookie}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();assert.equal(body.units[0].registrations,1);assert.ok(!JSON.stringify(body).includes('PRIVATE'));
 assert.equal((await fetch(config.origin+'/api/registration/units?hospital_id=99999',{headers:{cookie}})).status,400);
 const post=command=>fetch(config.origin+'/api/registration',{method:'POST',headers:{cookie,origin:config.origin,'content-type':'application/json'},body:JSON.stringify({...command,csrf:'token'})});
 assert.equal((await post(register({organization:'09611'}))).status,400);assert.equal((await post(register({email:'forged@example.test'}))).status,400);assert.equal(writes,0);
});
