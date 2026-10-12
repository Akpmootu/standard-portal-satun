import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFixture} from './fixtures/mou-write-data.js';
import {planEvidence,normalizeEvidenceCommand} from '../src/evidence-rules.js';
import {MAX_IMAGE_BYTES,imageMime,evidenceSignature} from '../src/evidence-types.js';
import {planMouWrite} from '../src/mou-write-rules.js';
import {downloadEvidence,uploadContext} from '../src/evidence-http.js';
import {evidenceDrive,validUploadLocation} from '../src/evidence-drive.js';
import {createServer} from 'node:http';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
const admin={provider:'google',subject:'admin-sub'},hospital={provider:'google',subject:'hospital-sub'},sha='a'.repeat(64);
const fixture=()=>({...writeFixture(),files:[]});
const command=()=>({requestId:randomUUID(),action:'reserve',saveRequestId:randomUUID(),module:'mou',hospitalId:'09625',itemId:'1',fiscalYear:2569,progressVersion:1,filename:'หลักฐาน.jpg',size:12,sha256:sha,driveId:'privateDriveFileID123'});
function commit(t,p){for(const c of p.changes){const key=c.table==='write_requests'?'request_id':'id',i=t[c.table].findIndex(r=>r[key]===c.record[key]);if(i<0)t[c.table].push(c.record);else t[c.table][i]=c.record;}}
test('new evidence accepts bounded images and rejects PDF uploads without changing legacy links',()=>{
 for(const filename of ['proof.jpg','proof.JPEG','proof.png','proof.webp']){
  const c={...command(),filename,size:MAX_IMAGE_BYTES},p=planEvidence(fixture(),admin,c,sha);
  assert.equal(p.changes[0].record.mime_type,imageMime(filename));
  assert.throws(()=>normalizeEvidenceCommand({...c,size:MAX_IMAGE_BYTES+1}),{code:'INVALID_FILE_SIZE'});
 }
 for(const filename of ['proof.pdf','proof.svg','proof.gif','proof.html','proof.jpg.exe','../proof.png'])assert.throws(()=>normalizeEvidenceCommand({...command(),filename}),{code:'IMAGE_REQUIRED'});
 const t=fixture();t.mou_progress[0].evidence_link='https://drive.google.com/file/d/example/view';
 const c={requestId:randomUUID(),action:'save',hospitalId:'09625',itemId:'1',fiscalYear:2569,expectedVersion:1,status:'completed',detail:'เอกสารใน Drive',evidenceLink:t.mou_progress[0].evidence_link};
 assert.equal(planMouWrite(t,admin,c,sha).next.evidence_link,c.evidenceLink);
});

test('image chunks check real signatures, MIME and size before sending any bytes to Drive',async()=>{
 let calls=0;const drive=evidenceDrive({storage:{},evidence:{}},{request:async o=>{calls++;assert.equal(o.headers['Content-Type'],'image/png');return {status:200};}});
 const location='https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x';
 const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 assert.equal(evidenceSignature(png,'image/png'),true);assert.equal(evidenceSignature(png,'image/jpeg'),false);
 await assert.rejects(drive.chunk(location,Buffer.from('not an image'),0,12,'image/png'),{code:'INVALID_FILE_CONTENT'});
 await assert.rejects(drive.chunk(location,png,0,MAX_IMAGE_BYTES+1,'image/png'),{code:'INVALID_UPLOAD_CHUNK'});assert.equal(calls,0);
 assert.deepEqual(await drive.chunk(location,png,0,png.length,'image/png'),{nextOffset:12,complete:true});assert.equal(calls,1);
 assert.equal(evidenceSignature(Buffer.from([255,216,255,0]),'image/jpeg'),true);
 assert.equal(evidenceSignature(Buffer.from('RIFFxxxxWEBP'),'image/webp'),true);
 assert.equal(evidenceSignature(Buffer.from('RIFFxxxxNOPE'),'image/webp'),false);
});

test('reserved file cannot satisfy evidence until verified and remains bound to actor, unit and record',()=>{
 const t=fixture(),c=command();commit(t,planEvidence(t,admin,c,sha));const file=t.files[0];
 const save={requestId:c.saveRequestId,action:'save',hospitalId:'09625',itemId:'1',fiscalYear:2569,expectedVersion:1,status:'completed',detail:'ผลจริง',evidenceLink:'',evidenceFileId:file.id};
 assert.throws(()=>planMouWrite(t,admin,save,sha),{code:'FILE_ACCESS_DENIED'});
 assert.throws(()=>planEvidence(t,hospital,{requestId:randomUUID(),action:'verify',fileId:file.id},sha),{code:'FILE_ACCESS_DENIED'});
 const v={requestId:randomUUID(),action:'verify',fileId:file.id};commit(t,planEvidence(t,admin,v,sha));assert.equal(planEvidence(t,admin,v,sha).result.replayed,true);
 const next=planMouWrite(t,admin,save,sha).next;assert.equal(next.evidence_type,'file');assert.equal(next.evidence_link,'');
 assert.throws(()=>planMouWrite(t,hospital,save,sha,new Date("2026-07-09")),{code:'FILE_ACCESS_DENIED'});
 t.files[0].record_id='different';assert.throws(()=>planMouWrite(t,admin,save,sha),{code:'FILE_ACCESS_DENIED'});
});
test('reserve observes current lock, version and hospital permission before producing a file record',()=>{
 const t=fixture(),c=command();assert.throws(()=>planEvidence(t,admin,{...c,progressVersion:0},sha),{code:'VERSION_CONFLICT'});
 assert.throws(()=>planEvidence(t,hospital,{...c,hospitalId:'09611'},sha),{code:'HOSPITAL_ACCESS_DENIED'});
 assert.throws(()=>planEvidence(t,hospital,c,sha,new Date('2026-10-09')),{code:'ASSESSMENT_LOCKED'});
 for(const change of [{filename:'../file.pdf'},{size:10*1024*1024+1},{sha256:'invalid'}])assert.throws(()=>planEvidence(t,admin,{...c,...change},sha));
 commit(t,planEvidence(t,admin,c,sha));assert.equal(planEvidence(t,admin,c,sha).result.replayed,true);
});
test('download requires an attached record and current unit scope; upload token is identity bound',async()=>{
 const t=fixture(),c=command();commit(t,planEvidence(t,admin,c,sha));t.files[0].upload_state='complete';const file=t.files[0],store={table:async n=>t[n]},drive={download:async()=>Buffer.from('%PDF-')};
 const access={status:'active',user:{id:'u1',role:'hospital',hospitalId:'09625'}};
 await assert.rejects(downloadEvidence({fileId:file.id,access,store,drive}),{code:'FILE_NOT_ATTACHED'});
 Object.assign(t.mou_progress[0],{evidence_file:file.id,evidence_type:'file'});assert.equal((await downloadEvidence({fileId:file.id,access,store,drive})).bytes.length,5);
 await assert.rejects(downloadEvidence({fileId:file.id,access:{...access,user:{...access.user,hospitalId:'09611'}},store,drive}),{code:'HOSPITAL_ACCESS_DENIED'});
 await assert.rejects(uploadContext({token:'encrypted',identity:hospital,access,store,codec:{name:()=> 'upload',read:async()=>({subject:'other',actorId:'u1'})}}),{code:'INVALID_UPLOAD_TOKEN'});
});
test('Drive chunks cannot target arbitrary URLs and downloads reject sharing or checksum changes',async()=>{
 const config={storage:{},evidence:{},ownerEmail:'dh.satun@gmail.com',evidenceFolderId:'privateFolder123'},bytes=Buffer.from('%PDF-test'),file={id:'file-'+randomUUID(),drive_file_id:'privateDriveFile123',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 let shared=false;const client={request:async o=>o.params?.alt?{data:bytes}:{data:{mimeType:'application/pdf',shared,trashed:false,size:bytes.length,parents:[config.evidenceFolderId],owners:[{emailAddress:config.ownerEmail}],permissions:[{role:'owner',emailAddress:config.ownerEmail}],appProperties:{portalFileId:file.id}}}};
 const drive=evidenceDrive(config,client);assert.equal((await drive.download(file)).toString(),bytes.toString());shared=true;await assert.rejects(drive.download(file),{code:'EVIDENCE_NOT_PRIVATE'});shared=false;await assert.rejects(drive.download({...file,sha256:sha}),{code:'EVIDENCE_CHECKSUM_MISMATCH'});
 for(const u of ['http://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=x','https://evil.example/upload/drive/v3/files?uploadType=resumable&upload_id=x']){assert.equal(validUploadLocation(u),false);await assert.rejects(drive.chunk(u,bytes,0,bytes.length),{code:'INVALID_UPLOAD_LOCATION'});}
});
test('MOU HTTP page exposes upload only with evidence gate; file endpoints require fresh identity, origin and CSRF',async t=>{
 const data=fixture(),config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake',MOU_WRITES_ENABLED:'1',MOU_WRITER_URL:'https://script.google.com/macros/s/abcdefghijklmnopqrstuvwxyz/exec',MOU_WRITER_SECRET:'b'.repeat(64),EVIDENCE_WRITES_ENABLED:'1',GOOGLE_EVIDENCE_REFRESH_TOKEN:'fake'}),codec=sessionCodec(config);
 const store={table:async n=>structuredClone(data[n]||[]),directory:async()=>[{id:'09625',name:'หน่วยทดสอบ'}]},server=createServer(createApp(config,{codec,store,drive:{},writer:{}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close();});
 const session=await codec.issue('session',{...admin,csrf:'token'},900),cookie=session.cookie.split(';')[0];
 const url=config.origin+'/mou/action?hospital_id=09625&year=2569&item_id=1&action=save';const page=await fetch(url,{headers:{cookie}});assert.equal(page.status,200);assert.ok((await page.text()).includes('data-evidence-file'));
 config.evidence.enabled=false;assert.ok(!(await (await fetch(url,{headers:{cookie}})).text()).includes('data-evidence-file'));config.evidence.enabled=true;
 const req=(headers,csrf='token')=>fetch(config.origin+'/api/files/start',{method:'POST',headers:{'Content-Type':'application/json',cookie,origin:config.origin,...headers},body:JSON.stringify({csrf})});
 assert.equal((await req({cookie:''})).status,401);assert.equal((await req({origin:'https://outside.example'})).status,403);assert.equal((await req({},'other')).status,403);
 data.users[1].account_status='disabled';assert.equal((await req({})).status,403);
});
