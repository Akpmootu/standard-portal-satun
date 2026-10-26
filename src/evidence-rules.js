import {fail} from './errors.js';
import {MAX_IMAGE_BYTES,imageMime} from './evidence-types.js';
import {writeActor,planMouWrite,bangkokTimestamp} from './mou-write-rules.js';
import {planModuleWrite,MODULES} from './module-rules.js';
import {requireEvidenceQuota,evidenceAttached} from './evidence-quota.js';
export const MAX_EVIDENCE_BYTES=10*1024*1024;
export function normalizeEvidenceCommand(c){
 fail(c&&typeof c==='object'&&!Array.isArray(c),'INVALID_EVIDENCE_COMMAND',400);
 const fields=c.action==='reserve'?['saveRequestId','module','hospitalId','itemId','fiscalYear','progressVersion','filename','size','sha256','driveId']:c.action==='verify'?['fileId']:['retire','trashComplete','release'].includes(c.action)?['fileId','expectedVersion']:[];
 fail(fields.length&&Object.keys(c).length===fields.length+2&&Object.keys(c).every(k=>['requestId','action',...fields].includes(k)),'INVALID_EVIDENCE_COMMAND',400);
 const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(s);
 fail(uuid(c.requestId),'INVALID_REQUEST_ID',400);
 if(c.action==='reserve'){
  fail(uuid(c.saveRequestId)&&['mou','ctam','hait'].includes(c.module)&&typeof c.hospitalId==='string'&&typeof c.itemId==='string'&&Number.isSafeInteger(c.progressVersion)&&c.progressVersion>=0,'INVALID_EVIDENCE_COMMAND',400);
  fail(c.module==='mou'?Number.isInteger(c.fiscalYear)&&c.fiscalYear>=2500&&c.fiscalYear<=2700:c.fiscalYear===0,'INVALID_FISCAL_YEAR',400);
  fail(typeof c.filename==='string'&&c.filename.length>0&&c.filename.length<=200&&!/[\\/\u0000-\u001f\u007f]/.test(c.filename)&&imageMime(c.filename),'IMAGE_REQUIRED',400);
  fail(Number.isSafeInteger(c.size)&&c.size>=12&&c.size<=MAX_IMAGE_BYTES,'INVALID_FILE_SIZE',400);
  fail(typeof c.sha256==='string'&&/^[a-f0-9]{64}$/.test(c.sha256)&&typeof c.driveId==='string'&&/^[A-Za-z0-9_-]{10,200}$/.test(c.driveId),'INVALID_EVIDENCE_COMMAND',400);
 }else{fail(typeof c.fileId==='string'&&/^file-[a-f0-9-]{36}$/.test(c.fileId),'INVALID_EVIDENCE_COMMAND',400);if(c.action!=='verify')fail(Number.isSafeInteger(c.expectedVersion)&&c.expectedVersion>0,'INVALID_VERSION',400);}
 return c;
}
export function evidenceTarget(tables,identity,c,sha,now=new Date()){
 const common={requestId:c.saveRequestId,action:'save',hospitalId:c.hospitalId,itemId:c.itemId,expectedVersion:c.progressVersion,status:'none',detail:'',evidenceLink:''};
 const proposal=c.module==='mou'?planMouWrite(tables,identity,{...common,fiscalYear:c.fiscalYear},sha,now):planModuleWrite(tables,identity,{...common,module:c.module,responsiblePerson:''},sha,now);
 fail(!proposal.replayed,'SAVE_REQUEST_ALREADY_COMMITTED',409);
 return c.module==='mou'?proposal.next:proposal.changes.find(x=>x.table===MODULES[c.module].progress).record;
}
export function planEvidence(tables,identity,input,sha,now=new Date()){
 const c=normalizeEvidenceCommand(input),actor=writeActor(identity,tables),time=bangkokTimestamp(now);
 fail(actor.role!=='reviewer','REVIEWER_SAVE_DENIED',403);fail(typeof sha==='string'&&/^[a-f0-9]{64}$/.test(sha),'INVALID_PAYLOAD_HASH',400);
 const receipt=tables.write_requests.filter(r=>r.request_id===c.requestId);fail(receipt.length<=1,'DUPLICATE_REQUEST_RECORD');
 if(receipt.length){const r=receipt[0];fail(r.actor_id===actor.id&&r.record_type==='evidence'&&r.operation===c.action&&r.payload_sha256===sha&&r.state==='committed','REQUEST_ID_REUSED',409);return {replayed:true,result:{ok:true,requestId:c.requestId,recordId:r.record_id,version:r.result_version,replayed:true}};}
 let next;
 if(c.action==='reserve'){
  const target=evidenceTarget(tables,identity,c,sha,now),id='file-'+c.requestId;
  fail(!tables.files.some(f=>f.id===id||f.drive_file_id===c.driveId),'FILE_ALREADY_EXISTS',409);
  requireEvidenceQuota(tables,actor.id,c.hospitalId,c.size,now);
  next={id,drive_file_id:c.driveId,hospital_id:c.hospitalId,record_type:c.module,record_id:target.id,original_filename:c.filename,mime_type:imageMime(c.filename),size_bytes:c.size,sha256:c.sha256,upload_state:'uploading',created_by:actor.id,created_at:time,_version:1};
 }else if(c.action==='verify'){
  const matches=tables.files.filter(f=>f.id===c.fileId);fail(matches.length===1,'FILE_NOT_FOUND',404);const old=matches[0];
  fail(old.created_by===actor.id&&(actor.role==='admin'||old.hospital_id===actor.hospital_id),'FILE_ACCESS_DENIED',403);
  fail(old.upload_state==='uploading'&&old._version===1,'FILE_STATE_CONFLICT',409);next={...old,upload_state:'complete',_version:2};
 }else{
  const matches=tables.files.filter(f=>f.id===c.fileId);fail(matches.length===1,'FILE_NOT_FOUND',404);const old=matches[0];
  fail(actor.role==='admin'||old.created_by===actor.id&&old.hospital_id===actor.hospital_id,'FILE_ACCESS_DENIED',403);
  fail(old._version===c.expectedVersion,'VERSION_CONFLICT',409);
  fail(['mou_progress','ctam_progress','rg12_progress'].every(name=>Array.isArray(tables[name])),'EVIDENCE_REFERENCE_CHECK_REQUIRED');
  fail(!evidenceAttached(tables,old),'FILE_IN_USE',409);
  const allowed=c.action==='retire'?['uploading','complete','retiring']:c.action==='trashComplete'?['retiring']:['trashed'];
  fail(allowed.includes(old.upload_state),'FILE_STATE_CONFLICT',409);
  if(c.action==='release')fail(actor.role==='admin','ADMIN_REQUIRED',403);
  next={...old,upload_state:c.action==='retire'?'retiring':c.action==='trashComplete'?'trashed':'released',_version:old._version+1};
 }
 const changes=[{table:'files',existing:c.action!=='reserve',record:next},{table:'audit_log',existing:false,record:{id:'evidence-audit-'+c.requestId,actor_id:actor.id,action:c.action,record_type:'files',record_id:next.id,hospital_id:next.hospital_id,request_id:c.requestId,changed_fields:JSON.stringify(['upload_state']),created_at:time}},{table:'write_requests',existing:false,record:{request_id:c.requestId,actor_id:actor.id,operation:c.action,payload_sha256:sha,record_type:'evidence',record_id:next.id,state:'committed',result_version:next._version,created_at:time,completed_at:time}}];
 return {changes,replayed:false,result:{ok:true,requestId:c.requestId,recordId:next.id,version:next._version,replayed:false}};
}
