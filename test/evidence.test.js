import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFixture} from './fixtures/mou-write-data.js';
import {planEvidence} from '../src/evidence-rules.js';
import {planMouWrite} from '../src/mou-write-rules.js';
import {downloadEvidence,uploadContext} from '../src/evidence-http.js';
import {evidenceDrive,validUploadLocation} from '../src/evidence-drive.js';
const admin={provider:'google',subject:'admin-sub'},hospital={provider:'google',subject:'hospital-sub'},sha='a'.repeat(64);
const fixture=()=>({...writeFixture(),files:[]});
const command=()=>({requestId:randomUUID(),action:'reserve',saveRequestId:randomUUID(),module:'mou',hospitalId:'09625',itemId:'1',fiscalYear:2569,progressVersion:1,filename:'หลักฐาน.pdf',size:10,sha256:sha,driveId:'privateDriveFileID123'});
function commit(t,p){for(const c of p.changes){const key=c.table==='write_requests'?'request_id':'id',i=t[c.table].findIndex(r=>r[key]===c.record[key]);if(i<0)t[c.table].push(c.record);else t[c.table][i]=c.record;}}
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
