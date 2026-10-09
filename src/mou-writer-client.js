import {normalizeRegistrationCommand} from './registration-rules.js';
import {normalizeModuleCommand} from './module-rules.js';
import {normalizeManagementCommand} from './management-rules.js';
import {normalizeMigrationCommand} from './migration-rules.js';
import {createHmac} from 'node:crypto';
import {fail,PortalError} from './errors.js';
import {normalizeMouCommand} from './mou-write-rules.js';
export function writerConfigured(config){return Boolean(config.writer?.enabled&&config.writer.url&&config.writer.secret);}
export function mouWriterClient(config,fetcher=fetch){
  return {async execute(identity,input,operation){
    fail(writerConfigured(config),'WRITES_DISABLED');
    const command=operation==='registration'?normalizeRegistrationCommand(input):operation==='assessment'?normalizeModuleCommand(input):operation==='management'?normalizeManagementCommand(input):operation==='migration'?normalizeMigrationCommand(input):normalizeMouCommand(input);
    const payload=JSON.stringify({v:2,audience:'standard-portal-mou-writer',timestamp:Date.now(),identity:{provider:identity.provider,subject:identity.subject,...(operation==='registration'?{email:identity.email}:{})},command,...(operation?{operation}:{})});
    const signature=createHmac('sha256',config.writer.secret).update(payload).digest('hex');
    try{
      let response=await fetcher(config.writer.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,signature}),redirect:'manual',signal:AbortSignal.timeout(45000)});
      if([302,303].includes(response.status)){
        const target=new URL(response.headers.get('location'));
        fail(target.protocol==='https:'&&target.hostname==='script.googleusercontent.com'&&!target.username&&!target.password,'INVALID_WRITER_REDIRECT');
        // ContentService redirects to a one-time result URL. Never forward the
        // signed command, credentials, or headers on that second request.
        response=await fetcher(target.href,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000)});
      }
      fail(response.ok,'WRITER_UNAVAILABLE');
      const body=await response.text();fail(body.length<=8192,'INVALID_WRITER_RESPONSE');
      const result=JSON.parse(body);
      if(result.ok===true){
        fail(result.requestId===command.requestId&&typeof result.recordId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(result.recordId)&&Number.isSafeInteger(result.version)&&result.version>0&&typeof result.replayed==='boolean','INVALID_WRITER_RESPONSE');
        return {ok:true,requestId:result.requestId,recordId:result.recordId,version:result.version,replayed:result.replayed};
      }
      const allowed=['REGISTRATION_EXISTS','REGISTRATION_NOT_FOUND','REGISTRATION_ALREADY_DECIDED','EXISTING_ACCOUNT_REVIEW_REQUIRED','REVIEW_PROFILE_EXISTS','INVALID_REGISTRATION','REVIEW_SCOPE_REQUIRED','REJECTION_NOTE_REQUIRED','REVIEW_PROFILE_REQUIRED','INVALID_REVIEW_PROFILE','REVIEW_SCOPE_DENIED','REVIEWER_SAVE_DENIED','VERSION_CONFLICT','REQUEST_ID_REUSED','WRITER_BUSY','COMMIT_UNCERTAIN','WRITES_DISABLED','ASSESSMENT_LOCKED','APPROVAL_REQUIRED','ACCOUNT_DISABLED','HOSPITAL_ACCESS_DENIED','ADMIN_REQUIRED','ASSESSMENT_DETAIL_REQUIRED','EVIDENCE_REQUIRED','AGENCY_NOT_CONFIRMED','PROGRESS_NOT_FOUND','ITEM_NOT_FOUND'];
      allowed.push('RESPONSIBLE_PERSON_REQUIRED','HOSPITAL_ONLY','INVALID_MODULE_STATUS','INVALID_EVIDENCE_LINK','REJECTION_NOTE_REQUIRED','INVALID_MANAGEMENT_COMMAND','INVALID_MANAGEMENT_FIELD','MANAGEMENT_RECORD_NOT_FOUND','SELF_ADMIN_CHANGE_DENIED','LAST_ADMIN_REQUIRED','NOTIFICATION_ACCESS_DENIED');
      const code=allowed.includes(result.error)?result.error:'WRITER_UNAVAILABLE';
      throw new PortalError(code,['VERSION_CONFLICT','REQUEST_ID_REUSED','AGENCY_NOT_CONFIRMED'].includes(code)?409:['ASSESSMENT_LOCKED','APPROVAL_REQUIRED','ACCOUNT_DISABLED','HOSPITAL_ACCESS_DENIED','ADMIN_REQUIRED'].includes(code)?403:['ASSESSMENT_DETAIL_REQUIRED','EVIDENCE_REQUIRED'].includes(code)?400:503);
    }catch(error){if(error instanceof PortalError)throw error;throw new PortalError('WRITE_RESULT_UNKNOWN');}
  }};
}
