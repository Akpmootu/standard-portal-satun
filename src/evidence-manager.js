import {createHash,randomUUID} from 'node:crypto';
import {fail} from './errors.js';
import {portalShell} from './portal-layout.js';
import {normalizeEvidenceCommand} from './evidence-rules.js';
import {evidenceAttached,evidenceUsage,EVIDENCE_QUOTAS as limits} from './evidence-quota.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const RETIRE_WAIT_SECONDS=120;
export async function evidenceInventory(store,access){
 fail(access?.status==='active','APPROVAL_REQUIRED',403);fail(access.user.role==='admin'||access.user.role==='hospital','FILE_ACCESS_DENIED',403);
 const names=['files','mou_progress','ctam_progress','rg12_progress'],rows=await Promise.all(names.map(name=>store.table(name)));return Object.fromEntries(names.map((name,i)=>[name,rows[i]]));
}
function requireFile(access,file){
 fail(file,'FILE_NOT_FOUND',404);fail(access.user.role==='admin'||access.user.role==='hospital'&&file.created_by===access.user.id&&file.hospital_id===access.user.hospitalId,'FILE_ACCESS_DENIED',403);
}
function completionId(id){const h=createHash('sha256').update('evidence-trash:'+id).digest('hex');return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);}
export async function manageEvidence({input,identity,access,store,writer,drive,action,now=new Date()}){
 fail(action==='discard'||action==='reconcile','INVALID_EVIDENCE_COMMAND',400);
 fail(input&&Object.keys(input).sort().join('|')==='expectedVersion|fileId|requestId','INVALID_EVIDENCE_COMMAND',400);
 const command=normalizeEvidenceCommand({...input,action:action==='discard'?'retire':'release'}),tables=await evidenceInventory(store,access),file=tables.files.find(f=>f.id===command.fileId);requireFile(access,file);
 fail(!evidenceAttached(tables,file),'FILE_IN_USE',409);
 if(action==='reconcile'){
  fail(access.user.role==='admin','ADMIN_REQUIRED',403);
  if(file.upload_state==='released')return writer.execute(identity,command,'evidence');
  fail(file.upload_state==='trashed','FILE_STATE_CONFLICT',409);fail(await drive.confirmMissing(file),'FILE_STILL_RETAINED',409);return writer.execute(identity,command,'evidence');
 }
 // Block new attachments/tokens under ScriptLock, then let in-flight uploads finish.
 const events=(await store.table('audit_log')).filter(row=>row.record_type==='files'&&row.record_id===file.id&&row.action==='retire'),times=events.map(row=>Date.parse(String(row.created_at).replace(' ','T')+'+07:00'));
 fail(times.every(Number.isFinite),'EVIDENCE_RETIRE_TIME_INVALID');
 const first=times.length?Math.min(...times):now.getTime(),reserved=await writer.execute(identity,command,'evidence');
 const wait=Math.max(0,Math.ceil((first+RETIRE_WAIT_SECONDS*1000-now.getTime())/1000));
 if(wait)return {ok:true,recordId:file.id,version:reserved.version,pending:true,retryAfter:wait};
 if(!await drive.confirmMissing(file))await drive.trash(file);
 return writer.execute(identity,{requestId:completionId(command.requestId),action:'trashComplete',fileId:file.id,expectedVersion:reserved.version},'evidence');
}
export function evidenceManagerPage(tables,access,{csrf,enabled,now=new Date()}){
 const admin=access.user.role==='admin',usage=evidenceUsage(tables,access.user.id,access.user.hospitalId||'',now),mb=bytes=>bytes>0&&bytes<1024?bytes+' B':bytes>0&&bytes<1024*1024?(bytes/1024).toLocaleString('th-TH',{maximumFractionDigits:2})+' KB':(bytes/1024/1024).toLocaleString('th-TH',{maximumFractionDigits:2})+' MB';
 const states={uploading:'อัปโหลดค้าง',complete:'ตรวจไฟล์แล้ว',retiring:'พักไฟล์ รอดำเนินการต่อ',trashed:'อยู่ในถังขยะ / รอตรวจการคืนพื้นที่',released:'ยืนยันว่าไม่พบไฟล์แล้ว'};
 const rows=tables.files.filter(f=>admin||f.created_by===access.user.id&&f.hospital_id===access.user.hospitalId).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 const form=(f,action,label)=>`<form data-evidence-manage data-action="${action}"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="requestId" value="${randomUUID()}"><input type="hidden" name="fileId" value="${esc(f.id)}"><input type="hidden" name="expectedVersion" value="${f._version}"><button class="btn" type="submit" ${enabled?'':'disabled'}>${label}</button><p role="status" aria-live="polite"></p></form>`;
 const body=`<section class="card"><h2>พื้นที่ของคุณ</h2><p>บัญชีนี้ ${mb(usage.account.bytes)} / ${mb(limits.accountBytes)} · ${usage.account.files} / ${limits.accountFiles} ไฟล์</p>${admin?`<p>ระบบรวม ${mb(usage.portal.bytes)} / ${mb(limits.portalBytes)} · ${usage.portal.files} / ${limits.portalFiles} ไฟล์</p>`:`<p>หน่วยบริการ ${mb(usage.unit.bytes)} / ${mb(limits.unitBytes)} · ${usage.unit.files} / ${limits.unitFiles} ไฟล์</p>`}<p>วันนี้ ${usage.daily.files} / ${limits.dailyFiles} ไฟล์ · ${mb(usage.daily.bytes)} / ${mb(limits.dailyBytes)} · ยังไม่แนบ ${usage.outstanding} / ${limits.outstandingFiles} ไฟล์</p><p>รูปไม่เกิน 2 MB ต่อไฟล์ เอกสาร PDF ให้ใช้ลิงก์ Google Drive หน่วยบริการจำกัดรวม ${mb(limits.unitBytes)}</p><p>ย้ายถังขยะไม่ใช่ลบถาวร และยังนับพื้นที่จนแอดมินตรวจยืนยันด้วยบัญชีเจ้าของว่าไม่พบไฟล์แล้ว ไม่มีการลบถาวรอัตโนมัติ</p><p>การพักไฟล์ต้องรออย่างน้อย 2 นาที จากนั้นกดดำเนินการต่อได้ ไฟล์ที่ถูกอ้างอิงในผลประเมินจะจัดการผ่านหน้านี้ไม่ได้</p></section>${rows.map(f=>{
  const attached=evidenceAttached(tables,f),stale=['uploading','complete'].includes(f.upload_state)&&!attached&&Date.parse(String(f.created_at).replace(' ','T')+'+07:00')<now.getTime()-86400000;
  return `<section class="card evidence-file-card"><h2>${esc(f.original_filename)}</h2><p>${esc(String(f.record_type||'').toUpperCase())} · หน่วยบริการ ${esc(f.hospital_id)} · ${mb(f.size_bytes)} · ${esc(states[f.upload_state]||f.upload_state)}</p><p>${esc(f.created_at)} · ${attached?'มีรายการอ้างอิง — เก็บรักษา':stale?'ยังไม่แนบเกิน 24 ชั่วโมง — โปรดตรวจสอบ':'ยังไม่พบรายการอ้างอิง'}</p>${attached?'':f.upload_state==='trashed'?(admin?form(f,'reconcile','ตรวจยืนยันการคืนพื้นที่'):''):f.upload_state==='released'?'':form(f,'discard',f.upload_state==='retiring'?'ดำเนินการย้ายต่อ':'พักไฟล์และย้ายไปถังขยะ')}</section>`;
 }).join('')||'<p>ยังไม่มีไฟล์ของคุณในระบบ</p>'}`;
 const confirmation='<dialog id="evidence-discard-confirm" aria-labelledby="evidence-confirm-title"><h2 id="evidence-confirm-title">พักไฟล์และย้ายไปถังขยะ?</h2><p>ใช้กับไฟล์ที่ยังไม่ถูกอ้างอิงเท่านั้น ขั้นแรกพักไฟล์อย่างน้อย 2 นาที จากนั้นจึงกดดำเนินการย้ายต่อได้</p><p>ไฟล์ในถังขยะยังนับพื้นที่ ไม่มีการลบถาวรอัตโนมัติ</p><div class="action-links"><button class="btn" type="button" data-evidence-cancel autofocus>ยกเลิก</button><button class="btn primary" type="button" data-evidence-confirm>ยืนยันพักไฟล์</button></div></dialog>';
 return portalShell('ไฟล์หลักฐานและพื้นที่จัดเก็บ',body+confirmation,{path:'/files',role:access.user.role,scripts:'<script src="/evidence-files.js" defer></script>'});
}
