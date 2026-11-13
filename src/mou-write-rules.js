import {reviewProfile,requireReviewerScope} from './review-access.js';
import {fail} from './errors.js';
import {evidenceLimit} from './evidence-types.js';
import {MOU_HOSPITAL_IDS} from './mou-reference.js';
import {normalizeAgencies} from './mou-agencies.js';
import {currentFiscalYear,legacyLock,normalizeCatalog} from './mou-read.js';

export const WRITE_TABLES=['identities','users','mou_categories','mou_items','mou_settings','mou_agencies','mou_progress','mou_review_history','audit_log','write_requests','reviewer_profiles','registration_requests'];
export const WRITE_LOG_HEADERS={
  audit_log:['id','actor_id','action','record_type','record_id','hospital_id','request_id','changed_fields','created_at'],
  write_requests:['request_id','actor_id','operation','payload_sha256','record_type','record_id','state','result_version','created_at','completed_at'],
};
function field(v,max,required=false){fail(typeof v==='string'&&v.length<=max,'INVALID_WRITE_FIELD',400);const s=v.trim();fail(!required||s.length>0,'REQUIRED_WRITE_FIELD',400);return s;}
export function validWriteLink(v){
  // Apps Script has no browser URL object. Restrict new links to absolute HTTP(S)
  // DNS/IPv4 URLs without credentials, backslashes, whitespace or control bytes.
  if(typeof v!=='string'||v.length>2048||/[\s\\\u0000-\u001f\u007f]/.test(v))return false;
  return /^https?:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[0-9]{1,5})?(?:[/?#][^\s]*)?$/i.test(v);
}
export function normalizeMouCommand(input){
  fail(input&&typeof input==='object'&&!Array.isArray(input),'INVALID_WRITE_COMMAND',400);
  const common=['requestId','action','hospitalId','itemId','fiscalYear','expectedVersion'];
  const extra=input.action==='save'?['status','detail','evidenceLink',...(Object.hasOwn(input,'evidenceFileId')?['evidenceFileId']:[])]:input.action==='review'?['reviewStatus','comment']:[];
  fail(extra.length&&Object.keys(input).length===common.length+extra.length&&Object.keys(input).every(k=>[...common,...extra].includes(k)),'INVALID_WRITE_COMMAND',400);
  fail(typeof input.requestId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId),'INVALID_REQUEST_ID',400);
  fail(typeof input.hospitalId==='string'&&MOU_HOSPITAL_IDS.includes(input.hospitalId),'HOSPITAL_OUTSIDE_PROJECT',403);
  fail(typeof input.itemId==='string'&&/^[1-9]\d{0,15}$/.test(input.itemId),'INVALID_ITEM_ID',400);
  fail(Number.isInteger(input.fiscalYear)&&input.fiscalYear>=2500&&input.fiscalYear<=2700,'INVALID_FISCAL_YEAR',400);
  fail(Number.isSafeInteger(input.expectedVersion)&&input.expectedVersion>=0&&input.expectedVersion<1e9,'INVALID_VERSION',400);
  const c=Object.fromEntries(common.map(k=>[k,input[k]]));c.requestId=c.requestId.toLowerCase();
  if(c.action==='save'){
    fail(['none','completed','in_progress','cannot_do'].includes(input.status),'INVALID_MOU_STATUS',400);
    c.status=input.status;c.detail=field(input.detail,10000);c.evidenceLink=field(input.evidenceLink,2048);
    fail(!c.evidenceLink||validWriteLink(c.evidenceLink),'INVALID_EVIDENCE_LINK',400);
    if(Object.hasOwn(input,'evidenceFileId')){fail(typeof input.evidenceFileId==='string'&&/^file-[a-f0-9-]{36}$/.test(input.evidenceFileId),'INVALID_FILE_ID',400);c.evidenceFileId=input.evidenceFileId;}
  }else{
    fail(['approved','rejected'].includes(input.reviewStatus),'INVALID_REVIEW_STATUS',400);
    c.reviewStatus=input.reviewStatus;c.comment=field(input.comment,10000,input.reviewStatus==='rejected');
  }
  return c;
}
export function attachedEvidence(tables,actor,fileId,recordId,module,hospitalId,requireCreator=true){
 const matches=(tables.files||[]).filter(f=>f.id===fileId);fail(matches.length===1,'FILE_NOT_FOUND',404);const f=matches[0];
 fail(f.upload_state==='complete'&&evidenceLimit(f.mime_type)>0&&f.record_id===recordId&&f.record_type===module&&f.hospital_id===hospitalId&&(!requireCreator||f.created_by===actor.id),'FILE_ACCESS_DENIED',403);return f;
}
export function writeActor(identity,tables){
  fail(['google','thaid'].includes(identity?.provider)&&typeof identity.subject==='string'&&identity.subject.length>0&&identity.subject.length<=255,'SIGN_IN_REQUIRED',401);
  const links=tables.identities.filter(r=>r.provider===identity.provider&&r.provider_subject===identity.subject);
  fail(links.length===1&&links[0].status==='active'&&links[0].approved_by&&links[0].approved_at&&links[0].legacy_user_id,'APPROVAL_REQUIRED',403);
  const users=tables.users.filter(r=>r.id===links[0].legacy_user_id);
  fail(users.length===1&&users[0].account_status==='active'&&['admin','hospital','reviewer'].includes(users[0].role),'ACCOUNT_DISABLED',403);
  fail(users[0].role!=='hospital'||MOU_HOSPITAL_IDS.includes(users[0].hospital_id),'HOSPITAL_ACCESS_DENIED',403);
  const user=users[0];
  return {...user,...(user.role==='reviewer'?{reviewProfile:reviewProfile(tables.reviewer_profiles,user.id)}:{})};
}
export function bangkokTimestamp(now){return new Date(now.getTime()+7*60*60*1000).toISOString().slice(0,19).replace('T',' ');}

// Pure transition shared by Node tests and the Apps Script writer. This function
// returns a plan only; the adapter must hold one ScriptLock through read + commit.
export function planMouWrite(tables,identity,input,payloadSha256,now=new Date()){
  const c=normalizeMouCommand(input),actor=writeActor(identity,tables);
  if(c.action==='review')requireReviewerScope(actor,c.hospitalId,c.fiscalYear);
  else {fail(actor.role!=='reviewer','REVIEWER_SAVE_DENIED',403);fail(actor.role==='admin'||actor.hospital_id===c.hospitalId,'HOSPITAL_ACCESS_DENIED',403);}
  const reviewer=c.action==='review'?reviewProfile(tables.reviewer_profiles,actor.id):null;
  fail(typeof payloadSha256==='string'&&/^[a-f0-9]{64}$/.test(payloadSha256),'INVALID_PAYLOAD_HASH',400);
  const previous=tables.write_requests.filter(r=>r.request_id===c.requestId);
  fail(previous.length<=1,'DUPLICATE_REQUEST_RECORD');
  if(previous.length){
    const p=previous[0];
    fail(p.actor_id===actor.id&&p.operation===c.action&&p.payload_sha256===payloadSha256&&p.record_type==='mou','REQUEST_ID_REUSED',409);
    fail(p.state==='committed'&&Number.isSafeInteger(p.result_version)&&p.result_version>0,'REQUEST_NOT_COMMITTED',409);
    return {replayed:true,result:{ok:true,requestId:c.requestId,recordId:p.record_id,version:p.result_version,replayed:true}};
  }
  const catalog=normalizeCatalog(tables.mou_categories,tables.mou_items,tables.mou_settings);
  const item=catalog.items.find(i=>i.id===c.itemId);fail(item,'ITEM_NOT_FOUND',404);
  const agency=normalizeAgencies(tables.mou_agencies).get(c.hospitalId);
  fail(agency&&agency.group!=='UNKNOWN','AGENCY_NOT_CONFIRMED',409);
  if(c.action==='save'&&actor.role!=='admin'){
    fail(!(agency.group==='HOSPITAL'&&item.categoryNumber===6),'ASSESSMENT_LOCKED',403);
    fail(!legacyLock(item,agency.group,c.fiscalYear,catalog.settings,currentFiscalYear(now)),'ASSESSMENT_LOCKED',403);
  }
  const matches=tables.mou_progress.filter(r=>r.hospital_id===c.hospitalId&&r.item_id===c.itemId&&String(r.fiscal_year)===String(c.fiscalYear));
  fail(matches.length<=1,'DUPLICATE_MOU_PROGRESS');
  const before=matches[0]||null;
  if(before)fail(Number.isSafeInteger(before._version)&&before._version>0,'INVALID_STORED_VERSION');
  fail(c.expectedVersion===(before?before._version:0),'VERSION_CONFLICT',409);
  const timestamp=bangkokTimestamp(now),id=before?.id||'mou-'+c.requestId,version=c.expectedVersion+1;
  let next=before?{...before}:{id,hospital_id:c.hospitalId,item_id:c.itemId,fiscal_year:c.fiscalYear,status:'none',assessment_detail:'',evidence_type:'none',evidence_file:'',evidence_link:'',admin_status:'pending',admin_comment:'',admin_reviewed_at:'',admin_reviewed_by:'',updated_at:'',updated_by:''};
  let history=null;
  if(c.action==='save'){
    const link=c.evidenceLink||before?.evidence_link||'';
    const file=c.evidenceFileId?attachedEvidence(tables,actor,c.evidenceFileId,id,'mou',c.hospitalId):before?.evidence_type==='file'?attachedEvidence(tables,actor,before.evidence_file,id,'mou',c.hospitalId,false):null;
    if(c.status!=='none'){
      fail(c.detail.length>0,'ASSESSMENT_DETAIL_REQUIRED',400);
      fail(validWriteLink(link)||file,'EVIDENCE_REQUIRED',400);
    }
    next={...next,status:c.status,assessment_detail:c.detail,updated_at:timestamp,updated_by:actor.id};
    if(c.evidenceLink){next.evidence_type='link';next.evidence_link=c.evidenceLink;}
    if(c.evidenceFileId)Object.assign(next,{evidence_type:'file',evidence_file:c.evidenceFileId,evidence_link:''});
    if(actor.role!=='admin')Object.assign(next,{admin_status:'pending',admin_comment:'',admin_reviewed_at:'',admin_reviewed_by:''});
  }else{
    fail(before,'PROGRESS_NOT_FOUND',404);
    Object.assign(next,{admin_status:c.reviewStatus,admin_comment:c.comment,admin_reviewed_at:timestamp,admin_reviewed_by:reviewer.name});
    history={id:'mou-history-'+c.requestId,progress_id:id,admin_status:c.reviewStatus,admin_comment:c.comment,admin_reviewed_by:reviewer.name,created_at:timestamp,_version:1,_request_id:c.requestId};
  }
  Object.assign(next,{_version:version,_request_id:c.requestId});
  const changed=Object.keys(next).filter(k=>next[k]!==before?.[k]);
  const audit={id:'mou-audit-'+c.requestId,actor_id:actor.id,action:c.action,record_type:'mou',record_id:id,hospital_id:c.hospitalId,request_id:c.requestId,changed_fields:JSON.stringify(changed),created_at:timestamp};
  const receipt={request_id:c.requestId,actor_id:actor.id,operation:c.action,payload_sha256:payloadSha256,record_type:'mou',record_id:id,state:'committed',result_version:version,created_at:timestamp,completed_at:timestamp};
  return {replayed:false,before,next,history,audit,receipt,result:{ok:true,requestId:c.requestId,recordId:id,version,replayed:false}};
}
