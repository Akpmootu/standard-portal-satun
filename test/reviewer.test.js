import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {reviewerFixture} from './fixtures/mou-write-data.js';
import {reviewProfile} from '../src/review-access.js';
import {resolveAccess,assessments} from '../src/authorization.js';
import {planMouWrite,normalizeMouCommand} from '../src/mou-write-rules.js';
import {loadMouWorkspace} from '../src/mou-read.js';
import {loadMouHistory} from '../src/mou-history-read.js';
import {loadReviewQueue} from '../src/review-queue.js';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
const who={provider:'google',subject:'reviewer-sub'},now=new Date('2026-09-07T00:00:00Z');
const command=(x={})=>({requestId:randomUUID(),action:'review',hospitalId:'09625',itemId:'1',fiscalYear:2569,expectedVersion:1,reviewStatus:'approved',comment:'',...x});
const hash=c=>createHash('sha256').update(JSON.stringify(normalizeMouCommand(c))).digest('hex');
function harness(){const data=reviewerFixture(),reads=[];const store={table:async n=>{reads.push(n);return structuredClone(data[n]);},directory:async ids=>ids.map(id=>({id,name:'หน่วย '+id}))};return {data,reads,store};}
test('review profile rejects duplicate, disabled, missing approval and wildcard scopes',()=>{
 const {data}=harness();const rows=data.reviewer_profiles;
 assert.equal(reviewProfile(rows,'u3').name,'ผู้ตรวจสมมติที่ได้รับมอบหมาย');
 assert.throws(()=>reviewProfile([...rows,rows[1]],'u3'),/REVIEW_PROFILE_REQUIRED/);
 for(const change of [{status:'disabled'},{approved_by:''},{display_name:''},{hospital_ids:'["*"]'},{fiscal_years:'["2569"]'},{hospital_ids:'["09625","09625"]'},{fiscal_years:'{}'}]){
  assert.throws(()=>reviewProfile([ {...rows[1],...change} ],'u3'),/REVIEW_PROFILE_REQUIRED|INVALID_REVIEW_PROFILE/);
 }
});
test('reviewer writes are scoped and name is bound to approved profile; revocation blocks replay',()=>{
 const {data}=harness(),c=command();const p=planMouWrite(data,who,c,hash(c),now);
 assert.equal(p.next.admin_reviewed_by,'ผู้ตรวจสมมติที่ได้รับมอบหมาย');assert.equal(p.history.admin_reviewed_by,p.next.admin_reviewed_by);assert.equal(p.audit.actor_id,'u3');
 for(const patch of [{hospitalId:'09626'},{fiscalYear:2568}])assert.throws(()=>planMouWrite(data,who,command(patch),hash(command(patch)),now),/REVIEW_SCOPE_DENIED/);
 assert.throws(()=>normalizeMouCommand({...c,reviewerName:'ชื่อปลอม'}),/INVALID_WRITE_COMMAND/);
 const save={requestId:randomUUID(),action:'save',hospitalId:'09625',itemId:'1',fiscalYear:2569,expectedVersion:1,status:'completed',detail:'changed',evidenceLink:''};
 assert.throws(()=>planMouWrite(data,who,save,hash(save),now),/REVIEWER_SAVE_DENIED/);
 data.write_requests.push(p.receipt);data.mou_progress=[p.next];
 assert.equal(planMouWrite(data,who,c,hash(c),now).replayed,true);
 data.reviewer_profiles[1].hospital_ids='[]';assert.throws(()=>planMouWrite(data,who,c,hash(c),now),/REVIEW_SCOPE_DENIED/);
 data.reviewer_profiles[1].status='disabled';assert.throws(()=>planMouWrite(data,who,c,hash(c),now),/REVIEW_PROFILE_REQUIRED/);
});
test('reviewer reads, queue and history exclude other units/years and other modules',async()=>{
 const {data,store,reads}=harness(),access=await resolveAccess(who,store);
 data.mou_progress[0].admin_status='pending';
 data.mou_progress.push({...data.mou_progress[0],id:'other',hospital_id:'09626',assessment_detail:'PRIVATE OUTSIDE'});
 const m=await loadMouWorkspace(store,access,{hospitalId:'09625',year:'2569'},now);
 assert.equal(m.isReviewer,true);assert.equal(m.canReview,true);assert.deepEqual(m.units.map(u=>u.id),['09625']);
 const start=reads.length;await assert.rejects(loadMouWorkspace(store,access,{hospitalId:'09626',year:'2569'},now),/HOSPITAL_ACCESS_DENIED/);assert.equal(reads.length,start);
 await assert.rejects(assessments(store,access,'ctam','09625'),/HOSPITAL_ACCESS_DENIED/);
 await assert.rejects(assessments(store,access,'mou','09625','2568'),/HOSPITAL_ACCESS_DENIED/);
 assert.equal((await loadReviewQueue(store,access,'2569',now)).rows.length,1);
 assert.equal((await loadReviewQueue(store,access,'2568',now)).rows.length,0);
 data.mou_review_history=[{id:'h-outside',progress_id:'other',admin_status:'approved',admin_comment:'PRIVATE',admin_reviewed_by:'outside',created_at:'2026-09-07 10:00:00'}];
 const history=await loadMouHistory(store,access,{year:'2569'},now);assert.equal(history.events.length,0);assert.deepEqual(history.units.map(u=>u.id),['09625']);
 await assert.rejects(loadMouHistory(store,access,{year:'2569',progressId:'other'},now),/PROGRESS_NOT_FOUND/);
 data.reviewer_profiles[1].status='disabled';await assert.rejects(resolveAccess(who,store),/REVIEW_PROFILE_REQUIRED/);
});
test('HTTP reviewer workflow denies save, arbitrary reviewerName, storage admin and out-of-scope reads',async t=>{
 const {data,store}=harness();let writes=0;
 const config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake'});
 config.writer={enabled:true,url:'fake',secret:'fake'};const codec=sessionCodec(config);
 const server=createServer(createApp(config,{store,codec,writer:{execute:async()=>{writes++;return {ok:true};}}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close();});
 const issued=await codec.issue('session',{...who,csrf:'token'},900),cookie=issued.cookie.split(';')[0];
 const get=p=>fetch(config.origin+p,{headers:{cookie}}),post=c=>fetch(config.origin+'/api/mou/write',{method:'POST',headers:{cookie,origin:config.origin,'Content-Type':'application/json'},body:JSON.stringify({...c,csrf:'token'})});
 const form=await get('/mou/action?hospital_id=09625&year=2569&item_id=1&action=review');assert.equal(form.status,200);const html=await form.text();assert.ok(html.includes('ผู้ตรวจสมมติที่ได้รับมอบหมาย'));assert.ok(!html.includes('name="reviewerName"'));
 assert.equal((await get('/mou/action?hospital_id=09625&year=2569&item_id=1&action=save')).status,403);
 assert.equal((await get('/api/admin/storage-check')).status,403);
 assert.equal((await get('/api/assessments?module=ctam&hospital_id=09625')).status,403);
 assert.equal((await get('/mou?hospital_id=09626&year=2569')).status,403);
 assert.equal((await get('/mou/reviews?year=2569')).status,200);
 assert.equal((await post(command({reviewerName:'ปลอม'}))).status,400);
 assert.equal((await post(command({hospitalId:'09626'}))).status,403);
 assert.equal(writes,0);assert.equal((await post(command())).status,200);assert.equal(writes,1);
 data.reviewer_profiles[1].status='disabled';assert.equal((await post(command())).status,403);assert.equal(writes,1);
});
