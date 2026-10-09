import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFixture} from './fixtures/mou-write-data.js';
import {planManagement} from '../src/management-rules.js';
import {writeActor} from '../src/mou-write-rules.js';
import {loadReport,reportCsv} from '../src/reports.js';
import {planMigration} from '../src/migration-rules.js';
import {mouDeltaPlan} from '../src/mou-delta-plan.js';
function data(){const t=writeFixture();for(const u of t.users)Object.assign(u,{_version:1,_request_id:'fixture'});for(const i of t.identities)i._version=1;for(const r of t.mou_settings)r._version=1;return {...t,announcements:[],notifications:[],rg12_comments:[],rg12_chapters:[{id:'1',chapter_number:1,title:'test',sort_order:1}]};}
const admin={provider:'google',subject:'admin-sub'},hospital={provider:'google',subject:'hospital-sub'},sha='a'.repeat(64);
const command=(action,extra)=>({requestId:randomUUID(),action,expectedVersion:1,...extra});
function commit(t,p){for(const c of p.changes){const key=c.table==='write_requests'?'request_id':'id',index=t[c.table].findIndex(r=>r[key]===c.record[key]);if(index<0)t[c.table].push(c.record);else t[c.table][index]=c.record;}}
test('disable is atomic, immediately revokes an existing identity, and keeps an audit receipt',()=>{
 const t=data(),c=command('account',{userId:'u1',role:'hospital',hospitalId:'09625',hospitalIds:[],fiscalYears:[],accountStatus:'disabled',displayName:'',note:'ระงับตามคำขอ'}),p=planManagement(t,admin,c,sha);commit(t,p);
 assert.equal(t.identities[0].status,'disabled');assert.equal(t.users[0].account_status,'disabled');assert.throws(()=>writeActor(hospital,t),{code:'APPROVAL_REQUIRED'});assert.equal(t.audit_log.length,1);assert.equal(planManagement(t,admin,c,sha).result.replayed,true);
 assert.throws(()=>planManagement(t,admin,{...c,requestId:randomUUID()},sha),{code:'VERSION_CONFLICT'});
});
test('role changes bind reviewer name and scope; self and last admin cannot be disabled',()=>{
 const t=data(),c=command('account',{userId:'u1',role:'reviewer',hospitalId:'',hospitalIds:['09625'],fiscalYears:[2569],accountStatus:'active',displayName:'ชื่อผู้ตรวจ',note:'มอบหมายหน้าที่'});commit(t,planManagement(t,admin,c,sha));
 const a=writeActor(hospital,t);assert.equal(a.role,'reviewer');assert.deepEqual(a.reviewProfile.hospitalIds,['09625']);assert.equal(a.reviewProfile.name,'ชื่อผู้ตรวจ');
 assert.throws(()=>planManagement(t,hospital,{...c,requestId:randomUUID()},sha),{code:'ADMIN_REQUIRED'});
 assert.throws(()=>planManagement(t,admin,{...c,userId:'u2',role:'admin',hospitalIds:[],fiscalYears:[],accountStatus:'disabled',requestId:randomUUID()},sha),{code:'SELF_ADMIN_CHANGE_DENIED'});
});
test('settings and announcements require admin, preserve literal text, and validate links',()=>{
 const t=data(),c=command('setting',{settingId:'1',value:'1'});assert.throws(()=>planManagement(t,hospital,c,sha),{code:'ADMIN_REQUIRED'});commit(t,planManagement(t,admin,c,sha));assert.equal(t.mou_settings[0].setting_value,'1');
 const announcement=command('announcement',{expectedVersion:0,announcementId:'',title:'<script>test</script>',message:'=IMPORTXML("x")',link:'https://example.org/',linkText:'เปิด',active:true});commit(t,planManagement(t,admin,announcement,sha));assert.equal(t.announcements[0].message,'=IMPORTXML("x")');
 assert.throws(()=>planManagement(t,admin,{...announcement,requestId:randomUUID(),link:'javascript:alert(1)'},sha),{code:'INVALID_EVIDENCE_LINK'});
});
test('HAIT help and response isolate hospitals; new comment invalidates previous response',()=>{
 const t=data();t.users[0].hospital_id='11402';t.mou_agencies.push({id:'11402',user_group:'โรงพยาบาล',classification_source:'owner_confirmed',status:'confirmed'});
 const c=command('comment',{expectedVersion:0,hospitalId:'11402',chapterId:'1',comment:'ต้องการความช่วยเหลือ',needsHelp:true});commit(t,planManagement(t,hospital,c,sha));
 const response=command('response',{hospitalId:'11402',chapterId:'1',response:'รับทราบ'});assert.throws(()=>planManagement(t,hospital,response,sha),{code:'ADMIN_REQUIRED'});commit(t,planManagement(t,admin,response,sha));assert.equal(t.rg12_comments[0].admin_responded_by,'ผู้ตรวจทดสอบ');
 commit(t,planManagement(t,hospital,{...c,requestId:randomUUID(),expectedVersion:2},sha));assert.equal(t.rg12_comments[0].admin_response,'');
 assert.throws(()=>planManagement(t,hospital,{...c,requestId:randomUUID(),hospitalId:'11403'},sha),{code:'HOSPITAL_ACCESS_DENIED'});
});
test('notifications can only be marked read by their recipient',()=>{
 const t=data();t.notifications=[{id:'n1',user_id:'u1',_version:1,is_read:0}];const c=command('read',{notificationId:'n1'});assert.throws(()=>planManagement(t,admin,c,sha),{code:'NOTIFICATION_ACCESS_DENIED'});commit(t,planManagement(t,hospital,c,sha));assert.equal(t.notifications[0].is_read,1);
});
test('report export excludes other hospitals and neutralizes spreadsheet formulas',async()=>{
 const t=data();t.mou_progress[0].assessment_detail='=HYPERLINK("https://evil.example")';t.mou_progress.push({...t.mou_progress[0],id:'outside',hospital_id:'09611'});
 const store={table:async n=>t[n],directory:async ids=>ids.map(id=>({id,name:'หน่วย '+id}))};const m=await loadReport(store,{status:'active',user:{id:'u1',role:'hospital',hospitalId:'09625'}},{module:'mou',year:2569});
 assert.equal(m.results.length,1);assert.equal(m.results[0].records.length,1);const csv=reportCsv(m);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(!csv.includes('09611'));
 await assert.rejects(loadReport(store,{status:'active',user:{id:'u1',role:'hospital',hospitalId:'09625'}},{hospitalId:'09611'}),{code:'HOSPITAL_ACCESS_DENIED'});
});
test('migration preserves native edits, imports under version checks, and cannot overwrite them',()=>{
 const t=data(),raw={...t.mou_progress[0],id:'1',admin_reviewed_by:'ผู้ตรวจ',updated_by:'1'},source={format:'standard-portal-mou-all-v1',source:{host:'192.168.0.44',read_only:true},tables:{mou_progress:[raw]}};
 raw.assessment_detail='changed';t.mou_progress[0]._version=2;assert.equal(mouDeltaPlan(source,t).summary.preservedConflicts,1);
 t.mou_progress[0]._version=1;const delta=mouDeltaPlan(source,t),c={requestId:randomUUID(),action:'import-mou',rows:delta.changes};const p=planMigration(t,admin,c,sha);commit(t,p);assert.equal(t.mou_progress[0].assessment_detail,'changed');assert.equal(planMigration(t,admin,c,sha).result.replayed,true);
 assert.throws(()=>planMigration(t,admin,{...c,requestId:randomUUID()},sha),{code:'VERSION_CONFLICT'});
});
