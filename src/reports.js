import {fail} from './errors.js';
import {requireHospital} from './authorization.js';
import {reviewHospitalIds} from './review-access.js';
import {normalizeAgencies} from './mou-agencies.js';
import {currentFiscalYear,STATUS_LABELS,REVIEW_LABELS,normalizeCatalog} from './mou-read.js';
import {MODULES} from './module-rules.js';
import {portalShell,escapeHtml as esc} from './management-page.js';
export async function loadReport(store,access,query={}){
 fail(access.status==='active','APPROVAL_REQUIRED',403);const module=query.module||'mou';fail(['mou','ctam','hait'].includes(module),'UNKNOWN_MODULE',400);
 const year=query.year==null?currentFiscalYear():Number(query.year);fail(Number.isInteger(year)&&year>=2500&&year<=2700,'INVALID_FISCAL_YEAR',400);
 fail(access.user.role!=='reviewer'||module==='mou','MODULE_SCOPE_REQUIRED',403);
 if(query.hospitalId)requireHospital(access,query.hospitalId,year,module);
 await store.prefetch?.(module==='mou'?['mou_agencies','mou_categories','mou_items','mou_settings','mou_progress']:['mou_agencies',MODULES[module].catalog,MODULES[module].progress]);
 const allowed=reviewHospitalIds(access.user,year),agencies=normalizeAgencies(await store.table('mou_agencies'));
 const ids=allowed.filter(id=>module==='mou'||agencies.get(id)?.group==='HOSPITAL');
 if(query.hospitalId){requireHospital(access,query.hospitalId,year,module);fail(ids.includes(query.hospitalId),'HOSPITAL_ACCESS_DENIED',403);}
 const units=await store.directory(query.hospitalId?[query.hospitalId]:ids),def=module==='mou'?{progress:'mou_progress',itemKey:'item_id'}:MODULES[module];
 let items;if(module==='mou'){const catalog=normalizeCatalog(await store.table('mou_categories'),await store.table('mou_items'),await store.table('mou_settings'));items=catalog.items;}else items=await store.table(def.catalog);
 const rows=(await store.table(def.progress)).filter(r=>units.some(u=>u.id===r.hospital_id)&&(module!=='mou'||Number(r.fiscal_year)===year));
 const seen=new Set();for(const r of rows){const key=r.hospital_id+'|'+r[def.itemKey];fail(!seen.has(key)&&items.some(i=>i.id===r[def.itemKey])&&Object.hasOwn(STATUS_LABELS,r.status)&&Object.hasOwn(REVIEW_LABELS,r.admin_status),'INVALID_REPORT_DATA');seen.add(key);}
 const result=units.map(u=>{const own=rows.filter(r=>r.hospital_id===u.id),visible=module==='mou'&&agencies.get(u.id)?.group==='HOSPITAL'?items.filter(i=>i.categoryNumber!==6):items;const ids=new Set(visible.map(i=>i.id)),records=own.filter(r=>ids.has(r[def.itemKey]));
  return {unit:u,total:visible.length,completed:records.filter(r=>r.status==='completed').length,inProgress:records.filter(r=>r.status==='in_progress').length,cannotDo:records.filter(r=>r.status==='cannot_do').length,none:visible.length-records.filter(r=>r.status!=='none').length,approved:records.filter(r=>r.admin_status==='approved').length,rejected:records.filter(r=>r.admin_status==='rejected').length,pending:records.filter(r=>r.status!=='none'&&r.admin_status==='pending').length,records,items:visible};});
 return {module,year,hospitalId:query.hospitalId||'',results:result,isAdmin:access.user.role==='admin',role:access.user.role};
}
export function reportPage(m){
 const name=m.module==='mou'?'MOU':MODULES[m.module].title;
 const q=new URLSearchParams({module:m.module,...(m.module==='mou'?{year:m.year}:{}),...(m.hospitalId?{hospital_id:m.hospitalId}:{})});
 const totals=m.results.reduce((o,r)=>{for(const key of Object.keys(o))o[key]+=r[key];return o;},{total:0,completed:0,approved:0,rejected:0,pending:0});
 return portalShell('รายงานผลประเมิน',`<form method="get">${m.hospitalId?`<input type="hidden" name="hospital_id" value="${esc(m.hospitalId)}">`:''}<label>โมดูล<select name="module">${(m.role==='reviewer'?['mou']:['mou','ctam','hait']).map(k=>`<option value="${k}" ${m.module===k?'selected':''}>${k.toUpperCase()}</option>`).join('')}</select></label><label>ปีงบประมาณ MOU<input name="year" type="number" min="2500" max="2700" value="${m.year}"></label><button class="btn" type="submit">แสดงรายงาน</button></form><p>รายงาน ${name}${m.module==='mou'?' · ปี '+m.year:''} · ${m.results.length} หน่วยบริการ</p><p>ผ่านเกณฑ์ที่หน่วยบริการรายงาน ${totals.completed}/${totals.total} ข้อ · ตรวจอนุมัติ ${totals.approved} ข้อ · ต้องแก้ไข ${totals.rejected} ข้อ · บันทึกแล้วรอตรวจ ${totals.pending} ข้อ</p><p>จำนวนผ่านเกณฑ์เป็นสถานะที่หน่วยบริการรายงาน จำนวนตรวจอนุมัติเป็นผลพิจารณาของผู้ตรวจ</p><a class="btn" href="/reports.csv?${q}">ดาวน์โหลดรายงาน CSV</a><div class="report-scroll"><table><thead><tr><th>หน่วยบริการ</th><th>ผ่าน / ทั้งหมด</th><th>กำลังทำ</th><th>ไม่ผ่าน</th><th>ยังไม่ประเมิน</th><th>ตรวจอนุมัติ</th><th>ต้องแก้ไข</th><th>รอตรวจ</th></tr></thead><tbody>${m.results.map(r=>`<tr><td><a href="/${m.module}?hospital_id=${r.unit.id}${m.module==='mou'?'&year='+m.year:''}">${esc(r.unit.id+' · '+r.unit.name)}</a></td><td>${r.completed}/${r.total}</td><td>${r.inProgress}</td><td>${r.cannotDo}</td><td>${r.none}</td><td>${r.approved}</td><td>${r.rejected}</td><td>${r.pending}</td></tr>`).join('')}</tbody></table></div>`,{path:'/reports',role:m.role||(m.isAdmin?'admin':'hospital')});
}
function csvCell(v){let s=String(v??'');if(/^[\s]*[=+\-@]/.test(s)||/^[\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
export function reportCsv(m){
 const rows=[['โมดูล','ปีงบประมาณ','รหัสหน่วยบริการ','หน่วยบริการ','รหัสข้อ','หัวข้อ','สถานะ','ผลตรวจ','ผู้รับผิดชอบ','รายละเอียด','ข้อเสนอแนะ','ผู้ตรวจ','ตรวจเมื่อ','ลิงก์หลักฐาน']];
 for(const unit of m.results)for(const item of unit.items){const r=unit.records.find(r=>r[(m.module==='hait'?'sub_item_id':'item_id')]===item.id);rows.push([m.module,m.module==='mou'?m.year:'',unit.unit.id,unit.unit.name,item.id,item.title||item.item_text,STATUS_LABELS[r?.status||'none'],REVIEW_LABELS[r?.admin_status||'pending'],r?.responsible_person,r?.assessment_detail,r?.admin_comment,r?.admin_reviewed_by,r?.admin_reviewed_at,r?.evidence_link]);}
 return '\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
