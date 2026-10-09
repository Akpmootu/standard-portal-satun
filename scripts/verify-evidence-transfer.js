import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {readConfig,loadLocalEnvironment} from '../src/config.js';
import {googleStore} from '../src/google-store.js';
import {mouWriterClient} from '../src/mou-writer-client.js';
import {evidenceDrive} from '../src/evidence-drive.js';
import {startEvidence} from '../src/evidence-http.js';
import {sessionCodec} from '../src/session.js';
async function main(){
 if(process.argv[2]!=='--test-private-file'||!process.argv[3])throw Error('TEST_FILE_ARGUMENT_REQUIRED');
 const bytes=await readFile(process.argv[3]);if(bytes.length>10*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')throw Error('INVALID_TEST_FILE');
 const config=readConfig({...await loadLocalEnvironment(),MOU_WRITES_ENABLED:'1',EVIDENCE_WRITES_ENABLED:'1'}),store=googleStore(config).forRequest();
 const [links,users,progress]=await Promise.all(['identities','users','mou_progress'].map(n=>store.table(n)));
 const admins=links.filter(i=>i.email===config.ownerEmail&&i.provider==='google'&&i.status==='active'&&i.approved_by&&i.approved_at&&users.some(u=>u.id===i.legacy_user_id&&u.role==='admin'&&u.account_status==='active'));if(admins.length!==1)throw Error('NO_APPROVED_OWNER_ADMIN');
 const record=progress.find(r=>r.hospital_id==='09611'&&String(r.fiscal_year)==='2569'&&r.item_id==='3');if(!record)throw Error('TEST_TARGET_NOT_FOUND');
 const identity={provider:'google',subject:admins[0].provider_subject},writer=mouWriterClient(config),drive=evidenceDrive(config),codec=sessionCodec(config),sha256=createHash('sha256').update(bytes).digest('hex');
 const upload=await startEvidence({input:{requestId:randomUUID(),saveRequestId:randomUUID(),module:'mou',hospitalId:'09611',itemId:'3',fiscalYear:2569,progressVersion:record._version,filename:'portal-file-transfer-test.pdf',size:bytes.length,sha256},identity,store,writer,drive,codec});
 const value=await codec.read('upload',codec.name('upload')+'='+upload.token);if(!value)throw Error('INVALID_UPLOAD_TOKEN');
 let status=await drive.status(value.location,bytes.length),parts=0;
 while(!status.complete){const offset=status.nextOffset;status=await drive.chunk(value.location,bytes.subarray(offset,Math.min(offset+upload.chunkBytes,bytes.length)),offset,bytes.length);if(status.nextOffset<=offset)throw Error('UPLOAD_STALLED');parts++;}
 const fresh=googleStore(config).forRequest(),file=(await fresh.table('files')).find(f=>f.id===upload.fileId);await drive.verify(file);
 await writer.execute(identity,{requestId:value.finishRequestId,action:'verify',fileId:file.id},'evidence');
 const afterStore=googleStore(config).forRequest(),after=(await afterStore.table('mou_progress')).find(r=>r.id===record.id);if(JSON.stringify(after)!==JSON.stringify(record))throw Error('ASSESSMENT_CHANGED_DURING_TEST');
 const complete=(await afterStore.table('files')).find(f=>f.id===file.id);if(complete.upload_state!=='complete')throw Error('UPLOAD_NOT_VERIFIED');
 const result={ok:true,fileId:file.id,size:bytes.length,parts,sha256,private:true,verified:true,attached:false,assessmentUnchanged:true};await writeFile('.migration/evidence-transfer-receipt.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
}
main().catch(e=>{console.error('EVIDENCE_TRANSFER_FAILED: '+(e.code||(['NO_APPROVED_OWNER_ADMIN','UPLOAD_STALLED','ASSESSMENT_CHANGED_DURING_TEST','UPLOAD_NOT_VERIFIED'].includes(e.message)?e.message:'PRIVATE_DETAILS_HIDDEN')));process.exitCode=1;});
