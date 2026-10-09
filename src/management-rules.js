import {fail} from './errors.js';
import {writeActor,bangkokTimestamp,validWriteLink} from './mou-write-rules.js';
import {reviewProfile} from './review-access.js';
import {MOU_HOSPITAL_IDS} from './mou-reference.js';
import {requireModuleUnit} from './module-rules.js';
export const MANAGEMENT_TABLES=['announcements','notifications','rg12_comments','rg12_chapters'];
export function normalizeManagementCommand(c){
 fail(c&&typeof c==='object'&&!Array.isArray(c),'INVALID_MANAGEMENT_COMMAND',400);
 const extra={account:['userId','expectedVersion','role','hospitalId','hospitalIds','fiscalYears','accountStatus','displayName','note'],setting:['settingId','expectedVersion','value'],announcement:['announcementId','expectedVersion','title','message','link','linkText','active'],comment:['hospitalId','chapterId','expectedVersion','comment','needsHelp'],response:['hospitalId','chapterId','expectedVersion','response'],read:['notificationId','expectedVersion']}[c.action];
 fail(extra&&Object.keys(c).length===extra.length+2&&Object.keys(c).every(k=>['requestId','action',...extra].includes(k)),'INVALID_MANAGEMENT_COMMAND',400);
 fail(typeof c.requestId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(c.requestId),'INVALID_REQUEST_ID',400);
 fail(Number.isSafeInteger(c.expectedVersion)&&c.expectedVersion>=0&&c.expectedVersion<1e9,'INVALID_VERSION',400);
 const out={...c,requestId:c.requestId.toLowerCase()},text=(key,max,required=false)=>{fail(typeof c[key]==='string'&&c[key].length<=max&&(!required||c[key].trim()),'INVALID_MANAGEMENT_FIELD',400);out[key]=c[key].trim();};
 if(c.action==='account'){
  text('userId',100,true);text('displayName',100);text('note',2000,true);
  fail(['admin','reviewer','hospital'].includes(c.role)&&['active','disabled'].includes(c.accountStatus)&&typeof c.hospitalId==='string','INVALID_MANAGEMENT_FIELD',400);
  reviewProfile([{user_id:'check',display_name:'check',status:'active',approved_by:'check',approved_at:'check',hospital_ids:JSON.stringify(c.hospitalIds),fiscal_years:JSON.stringify(c.fiscalYears)}],'check');
  fail(Array.isArray(c.hospitalIds)&&Array.isArray(c.fiscalYears),'INVALID_MANAGEMENT_FIELD',400);
  fail(c.role==='hospital'?MOU_HOSPITAL_IDS.includes(c.hospitalId):c.hospitalId==='','INVALID_HOSPITAL_MAPPING',400);
  fail(c.role==='reviewer'?c.hospitalIds.length>0&&c.fiscalYears.length>0:c.hospitalIds.length===0&&c.fiscalYears.length===0,'REVIEW_SCOPE_REQUIRED',400);
  fail(c.role==='hospital'||out.displayName,'REVIEW_PROFILE_REQUIRED',400);
 }else if(c.action==='setting'){text('settingId',100,true);fail(['0','1'].includes(c.value),'INVALID_MANAGEMENT_FIELD',400);}
 else if(c.action==='announcement'){text('announcementId',100);text('title',300,true);text('message',10000,true);text('link',2048);text('linkText',300);fail(!out.link||validWriteLink(out.link),'INVALID_EVIDENCE_LINK',400);fail(typeof c.active==='boolean','INVALID_MANAGEMENT_FIELD',400);}
 else if(['comment','response'].includes(c.action)){
  fail(MOU_HOSPITAL_IDS.includes(c.hospitalId)&&typeof c.chapterId==='string'&&/^[1-9]\d{0,15}$/.test(c.chapterId),'INVALID_MANAGEMENT_FIELD',400);
  text(c.action==='comment'?'comment':'response',10000,true);if(c.action==='comment')fail(typeof c.needsHelp==='boolean','INVALID_MANAGEMENT_FIELD',400);
 }else text('notificationId',100,true);
 return out;
}
export function planManagement(tables,identity,input,sha,now=new Date()){
 const c=normalizeManagementCommand(input),actor=writeActor(identity,tables),time=bangkokTimestamp(now);
 const admin=['account','setting','announcement','response'].includes(c.action);
 fail(!admin||actor.role==='admin','ADMIN_REQUIRED',403);
 fail(/^[a-f0-9]{64}$/.test(sha),'INVALID_PAYLOAD_HASH',400);
 const receipts=tables.write_requests.filter(r=>r.request_id===c.requestId);fail(receipts.length<=1,'DUPLICATE_REQUEST_RECORD');
 if(receipts.length){const r=receipts[0];fail(r.actor_id===actor.id&&r.record_type==='management'&&r.operation===c.action&&r.payload_sha256===sha,'REQUEST_ID_REUSED',409);fail(r.state==='committed','REQUEST_NOT_COMMITTED',409);return {replayed:true,result:{ok:true,requestId:c.requestId,recordId:r.record_id,version:r.result_version,replayed:true}};}
 const changes=[];let next,table;
 const check=r=>{fail(r,'MANAGEMENT_RECORD_NOT_FOUND',404);fail(r._version===c.expectedVersion,'VERSION_CONFLICT',409);return r;};
 if(c.action==='account'){
  table='users';const old=check(tables.users.find(u=>u.id===c.userId));
  fail(old.id!==actor.id||c.accountStatus==='active'&&c.role==='admin','SELF_ADMIN_CHANGE_DENIED',409);
  const links=tables.identities.filter(i=>i.legacy_user_id===old.id);fail(links.length===1&&links[0].approved_by&&links[0].approved_at,'IDENTITY_NOT_APPROVED',403);
  const activeAdmins=tables.users.filter(u=>u.role==='admin'&&u.account_status==='active'&&tables.identities.some(i=>i.legacy_user_id===u.id&&i.status==='active'&&i.approved_by&&i.approved_at));
  fail(old.role!=='admin'||old.account_status!=='active'||c.role==='admin'&&c.accountStatus==='active'||activeAdmins.length>1,'LAST_ADMIN_REQUIRED',409);
  next={...old,role:c.role,hospital_id:c.hospitalId,account_status:c.accountStatus,_version:old._version+1,_request_id:c.requestId};
  changes.push({table:'identities',existing:true,record:{...links[0],status:c.accountStatus,_version:links[0]._version+1}});
  const profiles=tables.reviewer_profiles.filter(p=>p.user_id===old.id);fail(profiles.length<=1,'INVALID_REVIEW_PROFILE');const p=profiles[0];
  if(p||c.role!=='hospital')changes.push({table:'reviewer_profiles',existing:Boolean(p),record:{...(p||{id:'profile-'+c.requestId,user_id:old.id}),display_name:c.displayName||p?.display_name||'',hospital_ids:JSON.stringify(c.hospitalIds),fiscal_years:JSON.stringify(c.fiscalYears),status:c.role==='hospital'?'disabled':c.accountStatus,approved_by:actor.id,approved_at:time,_version:(p? p._version:0)+1,_request_id:c.requestId}});
 }else if(c.action==='setting'){
  table='mou_settings';const old=check(tables.mou_settings.find(r=>r.id===c.settingId));fail(['allow_6months_edit','allow_9_12months_edit'].includes(old.setting_key),'INVALID_MOU_SETTING',400);
  next={...old,setting_value:c.value,updated_at:time,updated_by:actor.id,_version:old._version+1,_request_id:c.requestId};
 }else if(c.action==='announcement'){
  table='announcements';const old=c.announcementId?check(tables.announcements.find(r=>r.id===c.announcementId)):null;fail(old||c.expectedVersion===0,'VERSION_CONFLICT',409);
  next={id:old?.id||'announcement-'+c.requestId,title:c.title,message:c.message,link_url:c.link,link_text:c.linkText,is_active:c.active?1:0,created_at:old?.created_at||time,updated_at:time,_version:c.expectedVersion+1,_request_id:c.requestId};
 }else if(['comment','response'].includes(c.action)){
  table='rg12_comments';requireModuleUnit(tables,actor,'hait',c.hospitalId,c.action==='response');fail(tables.rg12_chapters.some(r=>r.id===c.chapterId),'ITEM_NOT_FOUND',404);
  const rows=tables.rg12_comments.filter(r=>r.hospital_id===c.hospitalId&&r.chapter_id===c.chapterId);fail(rows.length<=1,'DUPLICATE_COMMENT');const old=rows[0];if(old)check(old);else fail(c.action==='comment'&&c.expectedVersion===0,'MANAGEMENT_RECORD_NOT_FOUND',404);
  next={...(old||{id:'comment-'+c.requestId,hospital_id:c.hospitalId,chapter_id:c.chapterId,comment_text:'',needs_provincial_help:0,admin_response:'',created_at:time,updated_at:time,admin_responded_at:'',admin_responded_by:''}),_version:c.expectedVersion+1,_request_id:c.requestId};
  if(c.action==='comment')Object.assign(next,{comment_text:c.comment,needs_provincial_help:c.needsHelp?1:0,updated_at:time,admin_response:'',admin_responded_at:'',admin_responded_by:''});
  else Object.assign(next,{admin_response:c.response,admin_responded_at:time,admin_responded_by:reviewProfile(tables.reviewer_profiles,actor.id).name});
 }else{
  table='notifications';const old=check(tables.notifications.find(r=>r.id===c.notificationId));fail(old.user_id===actor.id,'NOTIFICATION_ACCESS_DENIED',403);next={...old,is_read:1,_version:old._version+1,_request_id:c.requestId};
 }
 changes.push({table,existing:tables[table].some(r=>r.id===next.id),record:next});
 changes.push({table:'audit_log',existing:false,record:{id:'management-audit-'+c.requestId,actor_id:actor.id,action:c.action,record_type:table,record_id:next.id,hospital_id:next.hospital_id||'',request_id:c.requestId,changed_fields:JSON.stringify({fields:Object.keys(next).filter(k=>!k.startsWith('_')),note:c.note||''}),created_at:time}});
 changes.push({table:'write_requests',existing:false,record:{request_id:c.requestId,actor_id:actor.id,operation:c.action,payload_sha256:sha,record_type:'management',record_id:next.id,state:'committed',result_version:next._version,created_at:time,completed_at:time}});
 return {changes,replayed:false,result:{ok:true,requestId:c.requestId,recordId:next.id,version:next._version,replayed:false}};
}
