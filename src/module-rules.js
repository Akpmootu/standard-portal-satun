import {fail} from './errors.js';
import {writeActor,validWriteLink,bangkokTimestamp,attachedEvidence} from './mou-write-rules.js';
import {normalizeAgencies} from './mou-agencies.js';
import {reviewProfile} from './review-access.js';
import {MOU_HOSPITAL_IDS} from './mou-reference.js';
export const MODULES={ctam:{title:'CTAM',catalog:'ctam_items',progress:'ctam_progress',history:'ctam_review_history',itemKey:'item_id'},hait:{title:'HAIT',catalog:'rg12_sub_items',progress:'rg12_progress',history:'hait_review_history',itemKey:'sub_item_id'}};
export function requireModuleUnit(tables,actor,module,hospitalId,review=false){
 fail(Object.hasOwn(MODULES,module),'UNKNOWN_MODULE',400);
 fail(actor.role==='admin'||actor.role==='hospital'&&actor.hospital_id===hospitalId,'HOSPITAL_ACCESS_DENIED',403);
 fail(!review||actor.role==='admin','ADMIN_REQUIRED',403);
 fail(normalizeAgencies(tables.mou_agencies).get(hospitalId)?.group==='HOSPITAL','HOSPITAL_ONLY',403);
}
export function normalizeModuleCommand(c){
 fail(c&&typeof c==='object'&&!Array.isArray(c)&&Object.hasOwn(MODULES,c.module),'INVALID_WRITE_COMMAND',400);
 const common=['requestId','module','action','hospitalId','itemId','expectedVersion'];
 const extra=c.action==='save'?['status','responsiblePerson','detail','evidenceLink',...(Object.hasOwn(c,'evidenceFileId')?['evidenceFileId']:[])]:c.action==='review'?['reviewStatus','comment']:[];
 fail(extra.length&&Object.keys(c).length===common.length+extra.length&&Object.keys(c).every(k=>[...common,...extra].includes(k)),'INVALID_WRITE_COMMAND',400);
 fail(typeof c.requestId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(c.requestId),'INVALID_REQUEST_ID',400);
 fail(MOU_HOSPITAL_IDS.includes(c.hospitalId)&&typeof c.itemId==='string'&&/^[1-9]\d{0,15}$/.test(c.itemId),'INVALID_ITEM_ID',400);
 fail(Number.isSafeInteger(c.expectedVersion)&&c.expectedVersion>=0&&c.expectedVersion<1e9,'INVALID_VERSION',400);
 const out=Object.fromEntries(common.map(k=>[k,c[k]]));out.requestId=c.requestId.toLowerCase();
 const text=(v,max)=>{fail(typeof v==='string'&&v.length<=max,'INVALID_WRITE_FIELD',400);return v.trim();};
 if(c.action==='save'){
  fail(['none','completed','in_progress','cannot_do'].includes(c.status),'INVALID_MODULE_STATUS',400);
  Object.assign(out,{status:c.status,responsiblePerson:text(c.responsiblePerson,300),detail:text(c.detail,10000),evidenceLink:text(c.evidenceLink,2048)});
  fail(!out.evidenceLink||validWriteLink(out.evidenceLink),'INVALID_EVIDENCE_LINK',400);
  if(Object.hasOwn(c,'evidenceFileId')){fail(typeof c.evidenceFileId==='string'&&/^file-[a-f0-9-]{36}$/.test(c.evidenceFileId),'INVALID_FILE_ID',400);out.evidenceFileId=c.evidenceFileId;}
 }else{
  fail(['approved','rejected'].includes(c.reviewStatus),'INVALID_REVIEW_STATUS',400);
  out.reviewStatus=c.reviewStatus;out.comment=text(c.comment,10000);
  fail(c.reviewStatus!=='rejected'||out.comment,'REJECTION_NOTE_REQUIRED',400);
 }
 return out;
}
export function planModuleWrite(tables,identity,input,sha,now=new Date()){
 const c=normalizeModuleCommand(input),def=MODULES[c.module],actor=writeActor(identity,tables);
 requireModuleUnit(tables,actor,c.module,c.hospitalId,c.action==='review');
 fail(typeof sha==='string'&&/^[a-f0-9]{64}$/.test(sha),'INVALID_PAYLOAD_HASH',400);
 const receipts=tables.write_requests.filter(r=>r.request_id===c.requestId);fail(receipts.length<=1,'DUPLICATE_REQUEST_RECORD');
 if(receipts.length){const r=receipts[0];fail(r.actor_id===actor.id&&r.record_type===c.module&&r.operation===c.action&&r.payload_sha256===sha,'REQUEST_ID_REUSED',409);fail(r.state==='committed','REQUEST_NOT_COMMITTED',409);return {replayed:true,result:{ok:true,requestId:c.requestId,recordId:r.record_id,version:r.result_version,replayed:true}};}
 fail(tables[def.catalog].some(i=>i.id===c.itemId),'ITEM_NOT_FOUND',404);
 const rows=tables[def.progress].filter(r=>r.hospital_id===c.hospitalId&&r[def.itemKey]===c.itemId);fail(rows.length<=1,'DUPLICATE_PROGRESS');
 const before=rows[0];fail(!before||Number.isSafeInteger(before._version)&&before._version>0,'INVALID_STORED_VERSION');
 fail(c.expectedVersion===(before?before._version:0),'VERSION_CONFLICT',409);
 const time=bangkokTimestamp(now),id=before?.id||c.module+'-'+c.requestId,version=c.expectedVersion+1;
 let next=before?{...before}:{id,hospital_id:c.hospitalId,[def.itemKey]:c.itemId,responsible_person:'',assessment_detail:'',evidence_type:'none',evidence_file:'',evidence_link:'',status:'none',admin_status:'pending',admin_comment:'',admin_reviewed_at:'',admin_reviewed_by:'',updated_at:'',updated_by:'',...(c.module==='hait'?{is_completed:0}:{})};
 const changes=[];
 if(c.action==='save'){
  const link=c.evidenceLink||before?.evidence_link||'';
  const file=c.evidenceFileId?attachedEvidence(tables,actor,c.evidenceFileId,id,c.module,c.hospitalId):before?.evidence_type==='file'?attachedEvidence(tables,actor,before.evidence_file,id,c.module,c.hospitalId,false):null;
  if(c.status!=='none'){fail(c.responsiblePerson,'RESPONSIBLE_PERSON_REQUIRED',400);fail(c.detail,'ASSESSMENT_DETAIL_REQUIRED',400);fail(validWriteLink(link)||file,'EVIDENCE_REQUIRED',400);}
  Object.assign(next,{status:c.status,responsible_person:c.responsiblePerson,assessment_detail:c.detail,updated_at:time,updated_by:actor.id});
  if(c.module==='hait')next.is_completed=c.status==='completed'?1:0;
  if(c.evidenceLink)Object.assign(next,{evidence_type:'link',evidence_link:c.evidenceLink});
  if(c.evidenceFileId)Object.assign(next,{evidence_type:'file',evidence_file:c.evidenceFileId,evidence_link:''});
  if(actor.role!=='admin')Object.assign(next,{admin_status:'pending',admin_comment:'',admin_reviewed_at:'',admin_reviewed_by:''});
 }else{
  fail(before,'PROGRESS_NOT_FOUND',404);const reviewer=reviewProfile(tables.reviewer_profiles,actor.id);
  Object.assign(next,{admin_status:c.reviewStatus,admin_comment:c.comment,admin_reviewed_at:time,admin_reviewed_by:reviewer.name});
  changes.push({table:def.history,existing:false,record:{id:c.module+'-history-'+c.requestId,progress_id:id,admin_status:c.reviewStatus,admin_comment:c.comment,admin_reviewed_by:reviewer.name,created_at:time,_version:1,_request_id:c.requestId}});
 }
 Object.assign(next,{_version:version,_request_id:c.requestId});
 changes.push({table:def.progress,existing:Boolean(before),record:next});
 changes.push({table:'audit_log',existing:false,record:{id:c.module+'-audit-'+c.requestId,actor_id:actor.id,action:c.action,record_type:c.module,record_id:id,hospital_id:c.hospitalId,request_id:c.requestId,changed_fields:JSON.stringify(Object.keys(next).filter(k=>next[k]!==before?.[k])),created_at:time}});
 changes.push({table:'write_requests',existing:false,record:{request_id:c.requestId,actor_id:actor.id,operation:c.action,payload_sha256:sha,record_type:c.module,record_id:id,state:'committed',result_version:version,created_at:time,completed_at:time}});
 return {changes,replayed:false,result:{ok:true,requestId:c.requestId,recordId:id,version,replayed:false}};
}
