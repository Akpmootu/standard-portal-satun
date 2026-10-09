import {fail} from './errors.js';
import {writeActor,bangkokTimestamp} from './mou-write-rules.js';
import {reviewProfile} from './review-access.js';
import {MOU_HOSPITAL_IDS} from './mou-reference.js';
export function normalizeRegistrationCommand(c){
 fail(c&&typeof c==='object'&&!Array.isArray(c),'INVALID_REGISTRATION',400);
 const base=['requestId','action'];
 const extra=c.action==='register'?['displayName','jobTitle','organization','phone']:['approve','reject'].includes(c.action)?['registrationId','expectedVersion','role','hospitalId','hospitalIds','fiscalYears','note']:[];
 fail(extra.length&&Object.keys(c).length===base.length+extra.length&&Object.keys(c).every(k=>[...base,...extra].includes(k)),'INVALID_REGISTRATION',400);
 fail(typeof c.requestId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(c.requestId),'INVALID_REQUEST_ID',400);
 const out={requestId:c.requestId.toLowerCase(),action:c.action};
 const text=(v,max,required=true)=>{fail(typeof v==='string'&&v.length<=max&&(!required||v.trim()),'INVALID_REGISTRATION',400);return v.trim();};
 if(c.action==='register'){
  Object.assign(out,{displayName:text(c.displayName,100),jobTitle:text(c.jobTitle,200),organization:text(c.organization,300),phone:text(c.phone,30)});
  fail(/^[+0-9() .-]{6,30}$/.test(out.phone),'INVALID_REGISTRATION',400);
 }else{
  Object.assign(out,{registrationId:text(c.registrationId,100),expectedVersion:c.expectedVersion,role:c.role,hospitalId:c.hospitalId,hospitalIds:c.hospitalIds,fiscalYears:c.fiscalYears,note:text(c.note,2000,false)});
  fail(/^reg-[a-f0-9-]{36}$/.test(out.registrationId)&&Number.isSafeInteger(c.expectedVersion)&&c.expectedVersion>0,'INVALID_REGISTRATION',400);
  fail(['admin','reviewer','hospital'].includes(c.role)&&typeof c.hospitalId==='string'&&Array.isArray(c.hospitalIds)&&Array.isArray(c.fiscalYears),'INVALID_REGISTRATION',400);
  // Reuse fail-closed scope validation, even for rejected applications.
  reviewProfile([{user_id:'check',display_name:'check',status:'active',approved_by:'check',approved_at:'check',hospital_ids:JSON.stringify(c.hospitalIds),fiscal_years:JSON.stringify(c.fiscalYears)}],'check');
  if(c.action==='approve'){
   fail(c.role!=='hospital'||MOU_HOSPITAL_IDS.includes(c.hospitalId),'INVALID_HOSPITAL_MAPPING',400);
   fail(c.role!=='reviewer'||c.hospitalIds.length>0&&c.fiscalYears.length>0,'REVIEW_SCOPE_REQUIRED',400);
   fail(c.role==='hospital'||c.hospitalId==='','INVALID_REGISTRATION',400);
   fail(c.role==='reviewer'||c.hospitalIds.length===0&&c.fiscalYears.length===0,'INVALID_REGISTRATION',400);
  }else fail(out.note,'REJECTION_NOTE_REQUIRED',400);
 }
 return out;
}
export function planRegistration(tables,identity,input,sha,now=new Date()){
 const c=normalizeRegistrationCommand(input),timestamp=bangkokTimestamp(now);
 fail(identity?.provider==='google'&&typeof identity.subject==='string'&&identity.subject.length>0&&identity.subject.length<=255,'SIGN_IN_REQUIRED',401);
 const actor=c.action==='register'?{id:'google:'+identity.subject}:writeActor(identity,tables);
 if(c.action!=='register')fail(actor.role==='admin','ADMIN_REQUIRED',403);
 fail(typeof sha==='string'&&/^[a-f0-9]{64}$/.test(sha),'INVALID_PAYLOAD_HASH',400);
 const receipts=tables.write_requests.filter(r=>r.request_id===c.requestId);fail(receipts.length<=1,'DUPLICATE_REQUEST_RECORD');
 if(receipts.length){const p=receipts[0];fail(p.actor_id===actor.id&&p.operation===c.action&&p.payload_sha256===sha&&p.record_type==='registration','REQUEST_ID_REUSED',409);fail(p.state==='committed','REQUEST_NOT_COMMITTED',409);return {replayed:true,result:{ok:true,requestId:c.requestId,recordId:p.record_id,version:p.result_version,replayed:true}};}
 const changes=[];let next;
 if(c.action==='register'){
  fail(typeof identity.email==='string'&&identity.email.length<=320&&identity.email.includes('@'),'SIGN_IN_REQUIRED',401);
  fail(!tables.registration_requests.some(r=>r.provider==='google'&&r.provider_subject===identity.subject),'REGISTRATION_EXISTS',409);
  // Registration grants nothing. An existing account can submit its verified-name profile once.
  next={id:'reg-'+c.requestId,provider:'google',provider_subject:identity.subject,email:identity.email,display_name:c.displayName,job_title:c.jobTitle,organization:c.organization,phone:c.phone,requested_at:timestamp,status:'pending',decided_at:'',decided_by:'',assigned_role:'',hospital_id:'',hospital_ids:'[]',fiscal_years:'[]',decision_note:'',_version:1,_request_id:c.requestId};
  changes.push({table:'registration_requests',record:next,existing:false});
 }else{
  const matches=tables.registration_requests.filter(r=>r.id===c.registrationId);fail(matches.length===1,'REGISTRATION_NOT_FOUND',404);const r=matches[0];
  fail(r._version===c.expectedVersion,'VERSION_CONFLICT',409);fail(r.status==='pending','REGISTRATION_ALREADY_DECIDED',409);
  next={...r,status:c.action==='approve'?'approved':'rejected',decided_at:timestamp,decided_by:actor.id,assigned_role:c.action==='approve'?c.role:'',hospital_id:c.action==='approve'?c.hospitalId:'',hospital_ids:c.action==='approve'?JSON.stringify(c.hospitalIds):'[]',fiscal_years:c.action==='approve'?JSON.stringify(c.fiscalYears):'[]',decision_note:c.note,_version:r._version+1,_request_id:c.requestId};
  if(c.action==='approve'){
   const links=tables.identities.filter(i=>i.provider===r.provider&&i.provider_subject===r.provider_subject);fail(links.length<=1,'AMBIGUOUS_IDENTITY',403);
   let userId='portal-'+r.id;
   if(links.length){
    const u=tables.users.find(u=>u.id===links[0].legacy_user_id);
    // Existing accounts retain their role and hospital. No implicit role change via signup.
    fail(links[0].status==='active'&&u?.account_status==='active'&&u.role===c.role&&(u.hospital_id||'')===c.hospitalId,'EXISTING_ACCOUNT_REVIEW_REQUIRED',409);userId=u.id;
   }else{
    fail(!tables.users.some(u=>u.id===userId||u.username===r.email),'EXISTING_ACCOUNT_REVIEW_REQUIRED',409);
    changes.push({table:'users',existing:false,record:{id:userId,username:r.email,role:c.role,user_group:'',last_login_at:'',hospital_id:c.hospitalId,created_at:timestamp,account_status:'active',_version:1,_request_id:c.requestId}});
    changes.push({table:'identities',existing:false,record:{id:'identity-'+r.id,provider:r.provider,provider_subject:r.provider_subject,legacy_user_id:userId,email:r.email,email_verified:'true',status:'active',approved_by:actor.id,approved_at:timestamp,created_at:timestamp,_version:1}});
   }
   if(['reviewer','admin'].includes(c.role)){
    fail(!tables.reviewer_profiles.some(p=>p.user_id===userId),'REVIEW_PROFILE_EXISTS',409);
    changes.push({table:'reviewer_profiles',existing:false,record:{id:'profile-'+r.id,user_id:userId,display_name:r.display_name,hospital_ids:JSON.stringify(c.hospitalIds),fiscal_years:JSON.stringify(c.fiscalYears),status:'active',approved_by:actor.id,approved_at:timestamp,_version:1,_request_id:c.requestId}});
   }
  }
  changes.push({table:'registration_requests',record:next,existing:true});
 }
 const audit={id:'account-audit-'+c.requestId,actor_id:actor.id,action:c.action,record_type:'registration',record_id:next.id,hospital_id:next.hospital_id,request_id:c.requestId,changed_fields:JSON.stringify(changes.map(x=>x.table)),created_at:timestamp};
 const receipt={request_id:c.requestId,actor_id:actor.id,operation:c.action,payload_sha256:sha,record_type:'registration',record_id:next.id,state:'committed',result_version:next._version,created_at:timestamp,completed_at:timestamp};
 changes.push({table:'audit_log',record:audit,existing:false},{table:'write_requests',record:receipt,existing:false});
 return {changes,result:{ok:true,requestId:c.requestId,recordId:next.id,version:next._version,replayed:false}};
}
