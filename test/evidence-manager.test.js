import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {manageEvidence} from '../src/evidence-manager.js';
import {planEvidence} from '../src/evidence-rules.js';
import {evidenceUsage} from '../src/evidence-quota.js';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
import {writeFixture} from './fixtures/mou-write-data.js';
const config=()=>readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake',MOU_WRITES_ENABLED:'1',MOU_WRITER_URL:'https://script.google.com/macros/s/abcdefghijklmnopqrstuvwxyz/exec',MOU_WRITER_SECRET:'b'.repeat(64),EVIDENCE_WRITES_ENABLED:'1',GOOGLE_EVIDENCE_REFRESH_TOKEN:'fake'});
test('retire waits for in-flight uploads, resumes safely and only owner-confirmed absence releases bytes',async()=>{
 const data=writeFixture();Object.assign(data,{ctam_progress:[],rg12_progress:[],files:[{id:'file-'+randomUUID(),drive_file_id:'managedDriveFile123',hospital_id:'09625',created_by:'u2',record_type:'mou',record_id:'unattached',original_filename:'test.png',size_bytes:12,mime_type:'image/png',sha256:'a'.repeat(64),created_at:'2026-01-01 09:00:00',upload_state:'complete',_version:2}]});
 let now=new Date('2026-10-26T02:00:00Z'),missing=false,trashCalls=0;
 const store={table:async name=>structuredClone(data[name]||[])},identity={provider:'google',subject:'admin-sub'},access={status:'active',user:{id:'u2',role:'admin'}},file=data.files[0];
 const writer={execute:async(who,command)=>{const hash=createHash('sha256').update(JSON.stringify(command)).digest('hex'),plan=planEvidence(data,who,command,hash,now);if(plan.changes)for(const c of plan.changes){const key=c.table==='write_requests'?'request_id':'id',at=data[c.table].findIndex(r=>r[key]===c.record[key]);if(at<0)data[c.table].push(c.record);else data[c.table][at]=c.record;}return plan.result;}};
 const drive={confirmMissing:async()=>missing,trash:async()=>{trashCalls++;}},input={requestId:randomUUID(),fileId:file.id,expectedVersion:2};
 const run=()=>manageEvidence({input,identity,access,store,writer,drive,action:'discard',now});
 const first=await run();assert.equal(first.pending,true);assert.equal(first.retryAfter,120);assert.equal(trashCalls,0);assert.equal(data.files[0].upload_state,'retiring');
 now=new Date('2026-10-26T02:02:01Z');assert.equal((await run()).ok,true);assert.equal(trashCalls,1);assert.equal(data.files[0].upload_state,'trashed');
 assert.equal(evidenceUsage(data,'u2','09625',now).portal.bytes,12);
 const release={requestId:randomUUID(),fileId:file.id,expectedVersion:4};
 await assert.rejects(manageEvidence({input:release,identity,access,store,writer,drive,action:'reconcile',now}),{code:'FILE_STILL_RETAINED'});assert.equal(data.files[0].upload_state,'trashed');
 missing=true;assert.equal((await manageEvidence({input:release,identity,access,store,writer,drive,action:'reconcile',now})).ok,true);assert.equal(evidenceUsage(data,'u2','09625',now).portal.bytes,0);
 assert.equal((await manageEvidence({input:release,identity,access,store,writer,drive,action:'reconcile',now})).replayed,true);
});
test('file manager is scoped, escapes filenames and cleanup requires session, origin and CSRF',async t=>{
 const data=writeFixture();data.files=[{id:'file-00000000-0000-4000-8000-000000000001',hospital_id:'09625',created_by:'u1',original_filename:'<script>evil</script>.jpg',record_type:'mou',record_id:'none',size_bytes:12,upload_state:'complete',created_at:'2026-01-01 09:00:00',_version:2},{id:'file-other',hospital_id:'09611',created_by:'other',original_filename:'PRIVATE_OTHER_UNIT.jpg',size_bytes:12,upload_state:'complete',created_at:'2026-01-01 09:00:00',_version:2}];
 const c=config(),codec=sessionCodec(c),server=createServer(createApp(c,{codec,store:{table:async n=>structuredClone(data[n]||[]),directory:async()=>[]},writer:{execute:()=>assert.fail('No write expected')},drive:{}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));c.origin='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close();});
 const token=await codec.issue('session',{provider:'google',subject:'hospital-sub',csrf:'token'},900),cookie=token.cookie.split(';')[0];
 assert.equal((await fetch(c.origin+'/files',{redirect:'manual'})).status,303);
 const response=await fetch(c.origin+'/files',{headers:{cookie}});assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes('ไฟล์หลักฐานและพื้นที่จัดเก็บ'));assert.ok(!html.includes('PRIVATE_OTHER_UNIT'));assert.ok(!html.includes('<script>evil'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('id="evidence-discard-confirm"'));assert.ok(html.includes('12 B'));
 for(const path of ['discard','reconcile']){
  const post=headers=>fetch(c.origin+'/api/files/'+path,{method:'POST',headers:{'Content-Type':'application/json',cookie,origin:c.origin,...headers},body:JSON.stringify({csrf:'wrong'})});
  assert.equal((await post({cookie:''})).status,401);assert.equal((await post({origin:'https://evil.example'})).status,403);assert.equal((await post({})).status,403);
 }
});
