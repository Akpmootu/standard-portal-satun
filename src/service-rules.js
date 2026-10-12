import {fail} from './errors.js';
import {writeActor,bangkokTimestamp} from './mou-write-rules.js';
import {requireHospital} from './authorization.js';
export function serviceSlot(kind,now=new Date()){
 const d=new Date(now.getTime()+7*3600000);if(kind==='weekly')d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);
}
export function normalizeServiceCommand(c){
 fail(c&&typeof c==='object'&&!Array.isArray(c),'INVALID_SERVICE_COMMAND',400);
 const extra={ai:['module','hospitalId','year','contentHash'],telegram:['kind','slot','contentHash'],settle:['reservationId','outcome','externalId']}[c.action];
 fail(extra&&Object.keys(c).length===extra.length+2&&Object.keys(c).every(k=>['requestId','action',...extra].includes(k)),'INVALID_SERVICE_COMMAND',400);
 fail(typeof c.requestId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(c.requestId),'INVALID_REQUEST_ID',400);
 if(c.action==='ai'){fail(['mou','ctam','hait'].includes(c.module)&&typeof c.hospitalId==='string'&&Number.isInteger(c.year)&&c.year>=2500&&c.year<=2700,'INVALID_SERVICE_COMMAND',400);}
 if(c.action==='telegram')fail(['daily','weekly','deadline','help','event'].includes(c.kind)&&typeof c.slot==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(c.slot),'INVALID_SERVICE_COMMAND',400);
 if(c.action!=='settle')fail(typeof c.contentHash==='string'&&/^[a-f0-9]{64}$/.test(c.contentHash),'INVALID_PAYLOAD_HASH',400);
 else fail(typeof c.reservationId==='string'&&/^service-[a-f0-9-]{36}$/.test(c.reservationId)&&['sent','failed','uncertain'].includes(c.outcome)&&typeof c.externalId==='string'&&/^[A-Za-z0-9_-]{0,100}$/.test(c.externalId),'INVALID_SERVICE_COMMAND',400);
 return {...c,requestId:c.requestId.toLowerCase()};
}
export function planService(tables,identity,input,sha,now=new Date()){
 const c=normalizeServiceCommand(input),actor=writeActor(identity,tables),time=bangkokTimestamp(now),day=time.slice(0,10);
 fail(/^[a-f0-9]{64}$/.test(sha),'INVALID_PAYLOAD_HASH',400);
 const prior=tables.write_requests.filter(r=>r.request_id===c.requestId);fail(prior.length<=1,'DUPLICATE_REQUEST_RECORD');
 if(prior.length){const p=prior[0];fail(p.actor_id===actor.id&&p.operation===c.action&&p.record_type==='service'&&p.payload_sha256===sha&&p.state==='committed','REQUEST_ID_REUSED',409);return {replayed:true,result:{ok:true,requestId:c.requestId,recordId:p.record_id,version:1,replayed:true}};}
 let recordId='service-'+c.requestId,hospitalId='';
 if(c.action==='ai'){
  fail(actor.role!=='reviewer'||c.module==='mou','MODULE_SCOPE_REQUIRED',403);
  if(c.hospitalId)requireHospital({status:'active',user:{...actor,hospitalId:actor.hospital_id}},c.hospitalId,c.year,c.module);else fail(actor.role==='admin','HOSPITAL_REQUIRED',403);
  hospitalId=c.hospitalId;const used=tables.audit_log.filter(r=>r.record_type==='service'&&r.action==='ai'&&r.created_at.slice(0,10)===day);
  fail(used.length<100&&used.filter(r=>r.actor_id===actor.id).length<10,'AI_DAILY_LIMIT',429);
 }else if(c.action==='telegram'){
  if(c.kind==='event'){
   const source=tables.write_requests.find(r=>r.request_id===c.slot&&r.actor_id===actor.id&&r.state==='committed'&&['mou','ctam','hait','management'].includes(r.record_type)&&['save','review','comment','response'].includes(r.operation));fail(source,'INVALID_EVENT_SOURCE',403);
  }else {fail(actor.role==='admin','ADMIN_REQUIRED',403);fail(c.slot===serviceSlot(c.kind,now),'INVALID_SERVICE_SLOT',400);}
  fail(!tables.audit_log.some(r=>r.record_type==='service'&&r.action==='telegram'&&JSON.parse(r.changed_fields).kind===c.kind&&JSON.parse(r.changed_fields).slot===c.slot),'SERVICE_ALREADY_RESERVED',409);
 }else{
  const original=tables.audit_log.find(r=>r.id===c.reservationId&&r.actor_id===actor.id&&r.record_type==='service'&&['ai','telegram'].includes(r.action));fail(original,'SERVICE_RESERVATION_NOT_FOUND',404);
  fail(!tables.audit_log.some(r=>r.record_type==='service'&&r.action==='settle'&&r.record_id===c.reservationId),'SERVICE_ALREADY_SETTLED',409);recordId=c.reservationId;
 }
 const metadata=c.action==='settle'?{outcome:c.outcome,externalId:c.externalId}:c.action==='ai'?{module:c.module,year:c.year,contentHash:c.contentHash}:{kind:c.kind,slot:c.slot,contentHash:c.contentHash};
 const audit={id:'service-'+c.requestId,actor_id:actor.id,action:c.action,record_type:'service',record_id:recordId,hospital_id:hospitalId,request_id:c.requestId,changed_fields:JSON.stringify(metadata),created_at:time};
 const receipt={request_id:c.requestId,actor_id:actor.id,operation:c.action,payload_sha256:sha,record_type:'service',record_id:recordId,state:'committed',result_version:1,created_at:time,completed_at:time};
 return {changes:[{table:'audit_log',existing:false,record:audit},{table:'write_requests',existing:false,record:receipt}],replayed:false,result:{ok:true,requestId:c.requestId,recordId,version:1,replayed:false}};
}
