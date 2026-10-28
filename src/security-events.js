import {createHmac,randomUUID} from 'node:crypto';

const routes=new Map(Object.entries({
 '/auth/google':'login','/auth/google/callback':'oauth_callback','/auth/logout':'logout',
 '/api/session/recover':'session_recovery','/api/mou/write':'mou_write','/api/assessment/write':'assessment_write',
 '/api/registration':'registration','/api/management':'management','/api/integrations/cron':'cron',
 '/api/public/progress':'public_progress','/api/admin/storage-capacity':'storage_capacity','/admin/storage':'storage_capacity',
 '/files':'files','/api/files/start':'file_upload','/api/files/chunk':'file_upload','/api/files/status':'file_upload','/api/files/finish':'file_upload',
 '/api/files/discard':'file_retire','/api/files/reconcile':'file_reconcile',
}));
const codes=new Set(['INVALID_HOST','INVALID_URL','INVALID_ORIGIN','INVALID_CSRF','INVALID_OAUTH_STATE','GOOGLE_SIGN_IN_CANCELLED','GOOGLE_SIGN_IN_FAILED',
 'SIGN_IN_REQUIRED','ADMIN_REQUIRED','ACCOUNT_DISABLED','APPROVAL_REQUIRED','HOSPITAL_ACCESS_DENIED','REVIEW_SCOPE_DENIED','REVIEWER_SAVE_DENIED','FILE_ACCESS_DENIED','NOTIFICATION_ACCESS_DENIED',
 'RECOVERY_ACCOUNT_MISMATCH','RECOVERY_CONTEXT_EXPIRED','CRON_ACCESS_DENIED','CRON_OWNER_NOT_APPROVED','AMBIGUOUS_IDENTITY','INVALID_USER_MAPPING','IDENTITY_NOT_APPROVED',
 'GOOGLE_QUOTA_EXCEEDED','PUBLIC_SUMMARY_UNAVAILABLE','SCHEDULED_SUMMARY_UNAVAILABLE','WRITER_UNAVAILABLE','WRITE_RESULT_UNKNOWN','COMMIT_UNCERTAIN','BODY_TOO_LARGE','REQUEST_ID_REUSED',
 'SERVICE_FAILURE','CONFIGURATION_REQUIRED','PUBLIC_STAGING_DISABLED','LOGIN_SUCCEEDED','LOGOUT_SUCCEEDED','ACCESS_CHANGED']);
const success=new Set(['LOGIN_SUCCEEDED','LOGOUT_SUCCEEDED','ACCESS_CHANGED']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

// Input is projected into a fixed schema. Never serialize req, identity, command or Error.
export function securityEvents({secret='',sink=record=>{(record.event==='portal_security_event'?console.info:console.warn)(JSON.stringify(record));},now=Date.now}={}){
 let windowStart=null,emitted=0,suppressed=0;
 const buckets=new Map(); // Fixed categories, never keyed by client input or actor.
 function emit(record){try{const result=sink(record);if(result&&typeof result.catch==='function')result.catch(()=>{});}catch{/* Telemetry must not affect a write or its response. */}}
 return {record(input={}){
  try{
   const status=Number.isInteger(input.status)&&input.status>=100&&input.status<=599?input.status:503;
   if(!success.has(input.code)&&status<400)return;
   if(status===404||status===405)return;
   const code=codes.has(input.code)?input.code:status>=500?'SERVICE_FAILURE':status===403?'ACCESS_DENIED':status===401?'SIGN_IN_REQUIRED':status===429?'QUOTA_LIMITED':null;
   if(!code)return;
   const time=now(),timestamp=new Date(time).toISOString(),requestId=uuid.test(input.requestId||'')?input.requestId:randomUUID();
   const category=code==='ACCESS_CHANGED'?'access_change':status>=500?'service':status===429?'quota':success.has(code)?'session':code.includes('OAUTH')||code.startsWith('GOOGLE_SIGN_IN')?'oauth':'access';
   let actor='anonymous';const identity=input.identity;
   if(secret&&identity?.provider==='google'&&typeof identity.subject==='string'&&identity.subject.length<=512)actor=createHmac('sha256',secret).update('portal-security-actor-v1\0google\0'+identity.subject).digest('hex').slice(0,24);
   const record={event:'portal_security_event',timestamp,requestId,severity:status>=500?'error':status>=400?'warning':'info',route:routes.get(input.path)||'other',method:['GET','POST','HEAD','PUT','PATCH','DELETE','OPTIONS'].includes(input.method)?input.method:'OTHER',status,code,actor};
   if(windowStart===null||time-windowStart>=60000){if(suppressed)emit({event:'portal_security_suppressed',timestamp,severity:'warning',count:suppressed});windowStart=time;emitted=0;suppressed=0;}
   if(emitted<60){emit(record);emitted++;}else suppressed++;
   if(category==='session')return;
   let bucket=buckets.get(category);if(!bucket){bucket={since:time,count:0,lastAlert:null};buckets.set(category,bucket);}
   if(time-bucket.since>=60000){bucket.since=time;bucket.count=0;}bucket.count++;
   const threshold=['service','access_change'].includes(category)?1:5;
   if(bucket.count>=threshold&&(bucket.lastAlert===null||time-bucket.lastAlert>=300000)){
    bucket.lastAlert=time;emit({event:'portal_security_alert',timestamp,requestId,severity:'warning',category,code,count:bucket.count,windowSeconds:60,cooldownSeconds:300});
   }
  }catch{/* Invalid telemetry input is never a reason to fail business logic. */}
 }};
}
