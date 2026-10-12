import {randomUUID} from 'node:crypto';
import {fail} from './errors.js';
import {imageMime} from './evidence-types.js';
import {writeActor} from './mou-write-rules.js';
import {normalizeEvidenceCommand,evidenceTarget} from './evidence-rules.js';
import {MODULES} from './module-rules.js';
import {requireHospital} from './authorization.js';
async function tablesFor(store,module){
 const names=['identities','users','reviewer_profiles','mou_categories','mou_items','mou_settings','mou_agencies','mou_progress','files'];
 if(module!=='mou'){const def=MODULES[module];fail(def,'UNKNOWN_MODULE',400);names.push(def.catalog,def.progress,def.history);}
 const records=await Promise.all(names.map(n=>store.table(n)));return {...Object.fromEntries(names.map((n,i)=>[n,records[i]])),write_requests:[],audit_log:[]};
}
export async function startEvidence({input,identity,store,writer,drive,codec}){
 const expected=['requestId','saveRequestId','module','hospitalId','itemId','fiscalYear','progressVersion','filename','size','sha256'];
 fail(Object.keys(input).length===expected.length&&Object.keys(input).every(k=>expected.includes(k)),'INVALID_EVIDENCE_COMMAND',400);
 let c=normalizeEvidenceCommand({...input,action:'reserve',driveId:'pending-drive-id'});const tables=await tablesFor(store,c.module),actor=writeActor(identity,tables),target=evidenceTarget(tables,identity,c,'0'.repeat(64));
 const existing=tables.files.find(f=>f.id==='file-'+c.requestId);let file;
 if(existing){fail(existing.created_by===actor.id&&existing.record_id===target.id&&existing.record_type===c.module&&existing.hospital_id===c.hospitalId&&existing.original_filename===c.filename&&existing.size_bytes===c.size&&existing.sha256===c.sha256,'REQUEST_ID_REUSED',409);file=existing;if(existing.upload_state==='complete')return {ok:true,fileId:file.id,complete:true};fail(existing.upload_state==='uploading','FILE_STATE_CONFLICT',409);c={...c,driveId:file.drive_file_id};}
 else{fail(actor.role!=='reviewer','REVIEWER_SAVE_DENIED',403);fail(tables.files.filter(f=>f.created_by===actor.id&&f.upload_state==='uploading').length<20,'UPLOAD_LIMIT_REACHED',429);c={...c,driveId:await drive.generateId()};file={id:'file-'+c.requestId,drive_file_id:c.driveId,hospital_id:c.hospitalId,record_type:c.module,record_id:target.id,original_filename:c.filename,mime_type:imageMime(c.filename),size_bytes:c.size,sha256:c.sha256,created_by:actor.id};}
 const result=await writer.execute(identity,c,'evidence');fail(result.ok,'EVIDENCE_RESERVE_FAILED');const location=await drive.begin(file);
 const upload=await codec.issue('upload',{fileId:file.id,actorId:actor.id,subject:identity.subject,module:c.module,hospitalId:c.hospitalId,location,size:c.size,finishRequestId:randomUUID()},1800);
 return {ok:true,fileId:file.id,token:upload.value,chunkBytes:1024*1024,complete:false};
}
export async function uploadContext({token,identity,access,store,codec}){
 fail(typeof token==='string'&&token.length<=4096,'INVALID_UPLOAD_TOKEN',403);const value=await codec.read('upload',codec.name('upload')+'='+token);
 fail(value&&value.subject===identity.subject&&value.actorId===access.user.id,'INVALID_UPLOAD_TOKEN',403);
 fail(access.user.role!=='reviewer','REVIEWER_SAVE_DENIED',403);requireHospital(access,value.hospitalId,null,value.module);
 const file=(await store.table('files')).find(f=>f.id===value.fileId);fail(file&&file.created_by===access.user.id&&file.hospital_id===value.hospitalId&&file.record_type===value.module&&file.size_bytes===value.size,'FILE_ACCESS_DENIED',403);
 return {value,file};
}
export async function downloadEvidence({fileId,access,store,drive}){
 fail(/^file-[a-f0-9-]{36}$/.test(fileId),'INVALID_FILE_ID',400);const file=(await store.table('files')).find(f=>f.id===fileId);fail(file?.upload_state==='complete','FILE_NOT_FOUND',404);
 const table=file.record_type==='mou'?'mou_progress':MODULES[file.record_type]?.progress;fail(table,'FILE_ACCESS_DENIED',403);
 const records=await store.table(table),r=records.find(r=>r.id===file.record_id&&r.hospital_id===file.hospital_id);
 const attached=r?.evidence_type==='file'&&r.evidence_file===file.id;
 // The uploader may verify a completed file before committing the assessment.
 // Other users can download only the evidence currently attached to a record.
 fail(attached||file.created_by===access.user.id&&access.user.role!=='reviewer','FILE_NOT_ATTACHED',404);
 requireHospital(access,file.hospital_id,file.record_type==='mou'&&r?Number(r.fiscal_year):null,file.record_type);return {file,bytes:await drive.download(file)};
}
