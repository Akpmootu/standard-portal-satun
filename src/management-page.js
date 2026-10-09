import {randomUUID} from 'node:crypto';
import {fail} from './errors.js';
import {MOU_HOSPITAL_IDS} from './mou-reference.js';
import {loadModule} from './module-page.js';
import {validWriteLink} from './mou-write-rules.js';
export const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const esc=escapeHtml;
export function portalShell(title,body,admin=false){return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Standard Portal</title><link rel="stylesheet" href="/workspace.css"><link rel="stylesheet" href="/mou-action.css"><link rel="stylesheet" href="/modules.css"><script src="/management.js" defer></script></head><body class="action-page"><main><nav class="module-nav" aria-label="เมนูหลัก"><a href="/">บัญชี</a><a href="/dashboard">MOU</a><a href="/ctam">CTAM</a><a href="/hait">HAIT</a><a href="/reports">รายงาน</a><a href="/news">ประกาศ</a><a href="/notifications">การแจ้งเตือน</a>${admin?'<a href="/admin/users">จัดการผู้ใช้งาน</a><a href="/admin/settings">รอบประเมิน</a>':''}</nav><p class="eyebrow">STANDARD PORTAL · SATUN</p><h1>${esc(title)}</h1>${body}</main></body></html>`;}
function hidden(fields){return Object.entries(fields).map(([k,v])=>`<input type="hidden" name="${k}" value="${esc(v)}">`).join('');}
function form(action,fields,body,csrf,enabled){return `<form data-management>${hidden({action,requestId:randomUUID(),csrf,...fields})}<fieldset ${enabled?'':'disabled'}>${body}<button class="btn primary" type="submit">บันทึก</button></fieldset><p role="status" aria-live="polite"></p></form>`;}
function select(name,label,options,value){return `<label>${label}<select name="${name}">${options.map(([k,t])=>`<option value="${esc(k)}" ${String(value)===String(k)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;}
function area(name,label,value='',max=10000){return `<label>${label}<textarea name="${name}" maxlength="${max}" rows="4">${esc(value)}</textarea></label>`;}
export async function managementPage(path,store,access,query,{csrf,enabled}){
 fail(access.status==='active','APPROVAL_REQUIRED',403);const admin=access.user.role==='admin';let body='',title;
 if(path==='/admin/users'){
  fail(admin,'ADMIN_REQUIRED',403);title='จัดการผู้ใช้งาน';
  const users=await store.table('users'),links=await store.table('identities'),profiles=await store.table('reviewer_profiles'),units=await store.directory([...MOU_HOSPITAL_IDS]);
  body='<p>เปลี่ยนสิทธิ์หรือปิดบัญชีมีผลตั้งแต่คำขอถัดไป ระบบป้องกันการปิดบัญชีแอดมินที่กำลังใช้งานและแอดมินคนสุดท้าย</p><a href="/admin/registrations">ตรวจคำขอลงทะเบียน</a>';
  for(const u of users){const l=links.find(i=>i.legacy_user_id===u.id),p=profiles.find(r=>r.user_id===u.id);if(!l?.approved_by)continue;let ids=[],years=[];try{ids=JSON.parse(p?.hospital_ids||'[]');years=JSON.parse(p?.fiscal_years||'[]');}catch{fail(false,'INVALID_REVIEW_PROFILE');}
   const fields=select('role','บทบาท',[['hospital','หน่วยบริการ'],['reviewer','ผู้ตรวจ MOU'],['admin','แอดมิน']],u.role)+select('accountStatus','การใช้งาน',[['active','เปิดใช้งาน'],['disabled','ปิดใช้งาน']],u.account_status)+`<label>ชื่อผู้ตรวจ<input name="displayName" maxlength="100" value="${esc(p?.display_name)}"></label>`+select('hospitalId','หน่วยบริการของผู้บันทึก',[['','ไม่ระบุ'],...units.map(u=>[u.id,u.id+' · '+u.name])],u.hospital_id)+`<label>หน่วยบริการที่มอบหมายให้ผู้ตรวจ<select name="hospitalIds" multiple size="6">${units.map(u=>`<option value="${u.id}" ${ids.includes(u.id)?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label><label>ปีงบประมาณของผู้ตรวจ<input name="fiscalYears" value="${esc(years.join(','))}" placeholder="2569,2570"></label>`+area('note','เหตุผลการเปลี่ยนแปลง (จำเป็น)','',2000)+`<p>แอดมินตรวจได้ทุกหน่วยบริการ ผู้ตรวจ MOU ใช้เฉพาะขอบเขตที่เลือก CTAM และ HAIT ให้แอดมินตรวจ</p>`;
   body+=`<details class="card"><summary>${esc(p?.display_name||l.email)} · ${esc(u.role)} · ${esc(u.account_status)}</summary><p>${esc(l.email)}</p>${form('account',{userId:u.id,expectedVersion:u._version},fields,csrf,enabled)}</details>`;
  }
 }else if(path==='/admin/settings'){
  fail(admin,'ADMIN_REQUIRED',403);title='เปิด–ปิดรอบประเมิน MOU';body='<p>กำหนดรอบที่หน่วยบริการบันทึกได้ตามกติกาเดิม ใช้กับปีงบประมาณปัจจุบัน ข้อยกเว้นตามประเภทหน่วยบริการยังคงใช้</p>';
  for(const r of await store.table('mou_settings'))if(['allow_6months_edit','allow_9_12months_edit'].includes(r.setting_key))body+=`<section class="card"><h2>${esc(r.label)}</h2>${form('setting',{settingId:r.id,expectedVersion:r._version},select('value','รับข้อมูล',[['0','ปิดรับ'],['1','เปิดรับ']],r.setting_value),csrf,enabled)}</section>`;
 }else if(path==='/news'){
  title='ประกาศ';const rows=await store.table('announcements');const fields=r=>`<label>หัวข้อ<input name="title" maxlength="300" required value="${esc(r?.title)}"></label>`+area('message','ข้อความ',r?.message)+`<label>ลิงก์<input name="link" type="url" maxlength="2048" value="${esc(r?.link_url)}"></label><label>ข้อความลิงก์<input name="linkText" maxlength="300" value="${esc(r?.link_text)}"></label>`+select('active','สถานะ',[['true','แสดงประกาศ'],['false','ซ่อนประกาศ']],String(Number(r?.is_active??1)===1));
  if(admin)body+=`<details class="card"><summary>เพิ่มประกาศ</summary>${form('announcement',{announcementId:'',expectedVersion:0},fields(),csrf,enabled)}</details>`;
  for(const r of rows.filter(r=>admin||Number(r.is_active)===1).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))))body+=`<section class="card"><h2>${esc(r.title)}</h2><p class="preserve-lines">${esc(r.message)}</p>${validWriteLink(r.link_url)?`<a href="${esc(r.link_url)}" target="_blank" rel="noopener noreferrer">${esc(r.link_text||'เปิดลิงก์')}</a>`:''}${admin?`<details><summary>แก้ไขประกาศ</summary>${form('announcement',{announcementId:r.id,expectedVersion:r._version},fields(r),csrf,enabled)}</details>`:''}</section>`;
  if(!rows.length)body+='<p>ยังไม่มีประกาศ</p>';
 }else if(path==='/notifications'){
  title='การแจ้งเตือน';const rows=(await store.table('notifications')).filter(r=>r.user_id===access.user.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  body=rows.map(r=>`<section class="card"><h2>${esc(r.title)}</h2><p>${esc(r.message)}</p><p>${esc(r.created_at)} · ${Number(r.is_read)?'อ่านแล้ว':'ยังไม่อ่าน'}</p>${!Number(r.is_read)?form('read',{notificationId:r.id,expectedVersion:r._version},'',csrf,enabled):''}</section>`).join('')||'<p>ไม่มีการแจ้งเตือนของบัญชีนี้</p>';
 }else if(path==='/hait/comments'){
  title='ความเห็นและคำขอความช่วยเหลือ HAIT';const m=await loadModule(store,access,'hait',query.hospitalId);
  if(!m.unit)return portalShell(title,'<p>เลือกโรงพยาบาลก่อนส่งความเห็น</p>'+m.units.map(u=>`<p><a href="/hait/comments?hospital_id=${u.id}">${esc(u.name)}</a></p>`).join(''),admin);
  const rows=(await store.table('rg12_comments')).filter(r=>r.hospital_id===m.hospitalId);body=`<h2>${esc(m.unit.name)}</h2><a href="/hait?hospital_id=${m.hospitalId}">กลับหน้าประเมิน HAIT</a>`;
  for(const chapter of m.chapters){const r=rows.find(r=>r.chapter_id===chapter.id);body+=`<section class="card"><h2>หมวด ${esc(chapter.chapter_number)} · ${esc(chapter.title)}</h2>${form('comment',{hospitalId:m.hospitalId,chapterId:chapter.id,expectedVersion:r? r._version:0},area('comment','ความเห็น / ปัญหา',r?.comment_text)+select('needsHelp','ต้องการความช่วยเหลือจากจังหวัด',[['false','ไม่ต้องการ'],['true','ต้องการ']],String(Number(r?.needs_provincial_help)===1)),csrf,enabled)}${r?.admin_response?`<h3>คำตอบผู้ดูแล</h3><p>${esc(r.admin_response)}</p><p>${esc(r.admin_responded_by)} · ${esc(r.admin_responded_at)}</p>`:''}${admin&&r?form('response',{hospitalId:m.hospitalId,chapterId:chapter.id,expectedVersion:r._version},area('response','ตอบความเห็น',r.admin_response),csrf,enabled):''}</section>`;}
 }else fail(false,'NOT_FOUND',404);
 return portalShell(title,body,admin);
}
