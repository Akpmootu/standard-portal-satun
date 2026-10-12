import {OAuth2Client} from 'google-auth-library';
import {fail,PortalError} from './errors.js';
import {portalShell,escapeHtml as esc} from './management-page.js';
const labels={announcements:'ประกาศเดิม',c_hosoffice:'สารบบหน่วยบริการต้นฉบับ',ctam_items:'เกณฑ์ประเมิน CTAM',ctam_progress:'ผลประเมิน CTAM เดิม',ctam_review_history:'ประวัติตรวจ CTAM เดิม',hait_chapters:'หมวด HAIT เก่า',hait_responsibles:'ผู้รับผิดชอบ HAIT เก่า',hait_status:'สถานะ HAIT เก่า',hospitals:'โรงพยาบาลและผู้ประสานงานเก่า',mou_categories:'หมวดประเมิน MOU',mou_items:'เกณฑ์ประเมิน MOU',mou_progress:'ผลประเมิน MOU เดิม',mou_review_history:'ประวัติตรวจ MOU เดิม',mou_settings:'รอบประเมิน MOU เดิม',notifications:'ประวัติแจ้งเตือนเดิม',rg12_chapters:'หมวด HAIT รุ่นปัจจุบัน',rg12_comments:'ความเห็นและคำขอช่วยเหลือเดิม',rg12_progress:'ผลประเมิน HAIT เดิม',rg12_sub_items:'เกณฑ์ประเมิน HAIT',users:'บัญชีผู้ใช้เดิม'};
const columnLabels={id:'รหัสเดิม',hospital_id:'รหัสหน่วยบริการเดิม',chapter_id:'รหัสหมวดเดิม',category_id:'รหัสหมวด',item_id:'รหัสข้อ',sub_item_id:'รหัสข้อย่อย',progress_id:'รหัสผลประเมินเดิม',user_id:'รหัสผู้ใช้เดิม',code:'รหัส',title:'หัวข้อ',full_name:'ชื่อ–สกุล',name:'ชื่อ',position:'ตำแหน่ง',phone:'เบอร์ติดต่อ',email:'อีเมล',status:'สถานะ',percent_complete:'ความคืบหน้า (%)',planned_finish:'กำหนดเสร็จ',actual_finish:'วันที่เสร็จจริง',obstacles:'ปัญหาและอุปสรรค',updated_by:'ผู้แก้ไขเดิม',updated_at:'แก้ไขเมื่อ',created_at:'สร้างเมื่อ',sort_order:'ลำดับ',username:'ชื่อบัญชีเดิม',role:'บทบาทเดิม',user_group:'ประเภทหน่วยบริการ',last_login_at:'เข้าใช้ล่าสุด',fiscal_year:'ปีงบประมาณ',assessment_detail:'รายละเอียดผลประเมิน',responsible_person:'ผู้รับผิดชอบ',admin_status:'ผลตรวจ',admin_comment:'ข้อเสนอแนะ',admin_reviewed_by:'ผู้ตรวจเดิม',admin_reviewed_at:'ตรวจเมื่อ',evidence_type:'ชนิดหลักฐาน',evidence_file:'ไฟล์หลักฐานเดิม',evidence_link:'ลิงก์หลักฐาน',description:'คำอธิบาย',title_en:'ชื่อภาษาอังกฤษ',item_number:'เลขข้อ',category_number:'เลขหมวด',chapter_number:'เลขหมวด',item_text:'หัวข้อประเมิน',target_group:'กลุ่มเป้าหมาย',period_type:'รอบประเมิน',setting_key:'รายการตั้งค่า',setting_value:'ค่าที่ตั้ง',label:'คำอธิบาย',message:'ข้อความ',link_url:'ลิงก์',link_text:'ข้อความลิงก์',is_active:'เปิดใช้งาน',is_read:'อ่านแล้ว',is_completed:'ดำเนินการแล้ว',type:'ประเภท',comment_text:'ความเห็น',needs_provincial_help:'ขอความช่วยเหลือจังหวัด',admin_response:'คำตอบผู้ดูแล',admin_responded_by:'ผู้ตอบเดิม',admin_responded_at:'ตอบเมื่อ',lead_full_name:'ชื่อผู้บริหาร',lead_position:'ตำแหน่งผู้บริหาร',lead_phone:'เบอร์ติดต่อผู้บริหาร',lead_email:'อีเมลผู้บริหาร',lead_updated_at:'ปรับข้อมูลผู้บริหารเมื่อ',coordinator_name:'ชื่อผู้ประสานงาน',coordinator_phone:'เบอร์ติดต่อผู้ประสานงาน',coordinator_email:'อีเมลผู้ประสานงาน',related_type:'หมวดที่เกี่ยวข้อง',related_item_id:'รายการที่เกี่ยวข้อง'};
const column=n=>{let s='';for(;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
export function requireArchiveAdmin(access){fail(access?.status==='active','APPROVAL_REQUIRED',403);fail(access.user.role==='admin','ADMIN_REQUIRED',403);}
export function migrationReader(config,catalog,injectedClient){
 const client=injectedClient||new OAuth2Client(config.storage.clientId,config.storage.clientSecret);if(!injectedClient)client.setCredentials({refresh_token:config.storage.refreshToken});
 async function get(path,params){const url=new URL(path);for(const [k,v] of Object.entries(params))for(const value of Array.isArray(v)?v:[v])url.searchParams.append(k,String(value));try{return (await client.request({url:url.href,method:'GET',timeout:15000,retry:false})).data;}catch{throw new PortalError('ARCHIVE_UNAVAILABLE',503);}}
 return {async read(access,name,page=1){
  requireArchiveAdmin(access);fail(catalog.archive?.verified===true,'ARCHIVE_NOT_VERIFIED',503);
  const t=Object.hasOwn(catalog.archive.tables,name)?catalog.archive.tables[name]:null;fail(t&&/^[a-z_]+$/.test(name),'UNKNOWN_ARCHIVE_TABLE',400);
  const pages=Math.max(1,Math.ceil(t.rows/50));fail(Number.isSafeInteger(page)&&page>=1&&page<=pages,'INVALID_ARCHIVE_PAGE',400);
  const lock=await get('https://www.googleapis.com/drive/v3/files/'+catalog.archive.spreadsheetId,{fields:'modifiedTime,trashed'});
  fail(lock.trashed===false&&lock.modifiedTime===catalog.archive.modifiedTime,'ARCHIVE_CHANGED',409);
  const root='https://sheets.googleapis.com/v4/spreadsheets/'+catalog.archive.spreadsheetId;
  const m=await get(root,{fields:'sheets(properties(title,gridProperties))'}),sheet=m.sheets?.find(s=>s.properties.title===name)?.properties;
  fail(sheet&&sheet.gridProperties.rowCount>=t.rows+1&&sheet.gridProperties.columnCount>=t.headers.length,'ARCHIVE_SCHEMA_CHANGED',409);
  const start=(page-1)*50+2,end=Math.min(start+49,t.rows+1),ranges=[`'${name}'!A1:${column(t.headers.length)}1`];
  if(t.rows)ranges.push(`'${name}'!A${start}:${column(t.headers.length)}${end}`);
  const values=await get(root+'/values:batchGet',{ranges,valueRenderOption:'UNFORMATTED_VALUE'});
  fail(JSON.stringify(values.valueRanges?.[0]?.values?.[0])===JSON.stringify(t.headers),'ARCHIVE_SCHEMA_CHANGED',409);
  const rows=t.rows?values.valueRanges?.[1]?.values||[]:[];
  fail(rows.length===(t.rows?end-start+1:0),'ARCHIVE_DATA_CHANGED',409);
  return {name,label:labels[name]||name,headers:t.headers,rows,page,pages,total:t.rows,start:t.rows?start-1:0,capturedAt:catalog.archive.capturedAt};
 }};
}
export function archivePage(catalog,model){
 const tables=Object.entries(catalog.archive.tables),total=tables.reduce((n,[,t])=>n+t.rows,0),capturedAt=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'long',timeStyle:'medium'}).format(new Date(catalog.archive.capturedAt));
 const body=`<p>เก็บข้อมูลธุรกิจต้นฉบับ ${tables.length} ตาราง รวม ${total.toLocaleString('th-TH')} แถว ณ ${esc(capturedAt)} (เวลาไทย)</p><p>ข้อมูลย้อนหลังสำหรับแอดมิน ไม่ใช่ผลประเมินล่าสุด การเปิดบัญชีเก่าในหน้านี้ไม่ให้สิทธิ์ใช้งานแก่บัญชีนั้น</p><form method="get"><label>ชุดข้อมูล<select name="table">${tables.map(([name,t])=>`<option value="${name}" ${model?.name===name?'selected':''}>${esc(labels[name]||name)} · ${t.rows.toLocaleString('th-TH')} แถว</option>`).join('')}</select></label><button class="btn">เปิดข้อมูลย้อนหลัง</button></form>${model?`<h2>${esc(model.label)}</h2><p>รายการ ${model.start}–${model.start?model.start+model.rows.length-1:0} จาก ${model.total.toLocaleString('th-TH')} · หน้า ${model.page}/${model.pages}</p><div class="report-scroll"><table><thead><tr>${model.headers.map(h=>`<th>${esc(columnLabels[h]||h)}</th>`).join('')}</tr></thead><tbody>${model.rows.map(r=>`<tr>${model.headers.map((_,i)=>`<td class="preserve-lines">${esc(r[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p>${model.page>1?`<a class="btn" href="/admin/archive?table=${model.name}&page=${model.page-1}">← หน้าก่อน</a>`:''} ${model.page<model.pages?`<a class="btn" href="/admin/archive?table=${model.name}&page=${model.page+1}">หน้าถัดไป →</a>`:''}</p>`:''}<p>${catalog.archive.unresolvedNotificationOwners?`ประวัติแจ้งเตือน ${catalog.archive.unresolvedNotificationOwners} รายการยังอ้างผู้ใช้ที่ไม่พบในบัญชีต้นทาง `:''}บัญชีเดิมและประวัติแจ้งเตือนยังต้องยืนยันเจ้าของก่อนผูกกับ Google Login ไม่มีการนำรหัสผ่านเดิมมาเก็บในคลังนี้</p>`;
 return portalShell('ข้อมูลต้นฉบับจากระบบเดิม',body,{role:'admin',path:'/admin/archive'});
}
export function resourcesPage(catalog,access){
 const names={'pcu-guideline':'คู่มือมาตรฐานหน่วยบริการปฐมภูมิ พ.ศ. 2568–2570','ctam-guideline':'คู่มือการตรวจประเมิน CTAM'};
 return portalShell('คู่มือประเมิน',`<p>คู่มือที่ย้ายจากระบบเดิม เก็บต้นฉบับใน Drive ของระบบ เปิดได้ตามสิทธิ์ผู้ใช้งาน</p>${catalog.files.filter(f=>Object.hasOwn(names,f.slug)).map(f=>`<section class="card"><h2>${names[f.slug]}</h2><p>PDF · ${(f.size_bytes/1024/1024).toFixed(2)} MB</p><a class="btn primary" href="/resources/${f.slug}">ดาวน์โหลดคู่มือ</a></section>`).join('')}`,{role:access.user.role,path:'/resources'});
}
export function libraryFile(catalog,access,slug){
 fail(access?.status==='active','APPROVAL_REQUIRED',403);
 const file=catalog.files.find(f=>f.slug===slug);fail(file,'RESOURCE_NOT_FOUND',404);
 fail(file.mime_type==='application/pdf'||access.user.role==='admin','ADMIN_REQUIRED',403);
 return file;
}
