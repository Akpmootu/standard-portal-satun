import {loadReport} from './reports.js';
import {portalShell} from './portal-layout.js';
import {fail} from './errors.js';
import {currentFiscalYear} from './mou-read.js';

export async function loadOverview(store,access,yearText){
 fail(access?.status==='active','APPROVAL_REQUIRED',403);
 const year=yearText==null?currentFiscalYear():Number(yearText);
 fail((yearText==null||/^\d{4}$/.test(String(yearText)))&&year>=2500&&year<=2700,'INVALID_FISCAL_YEAR',400);
 const modules=access.user.role==='reviewer'?['mou']:['mou','ctam','hait'];
 // Reuse reads only within this overview request; never cache identity or role state.
 const tables=new Map(),directories=new Map();
 const scopedStore={table(name){if(!tables.has(name))tables.set(name,store.table(name));return tables.get(name);},directory(ids){const key=JSON.stringify(ids);if(!directories.has(key))directories.set(key,store.directory(ids));return directories.get(key);}};
 const reports=await Promise.all(modules.map(module=>loadReport(scopedStore,access,{module,year})));
 return {role:access.user.role,year,modules:reports.map(m=>({module:m.module,units:m.results.length,...m.results.reduce((n,r)=>{
  n.records+=r.records.length;n.total+=r.total;n.completed+=r.completed;n.approved+=r.approved;n.rejected+=r.rejected;n.pending+=r.records.filter(row=>row.status!=='none'&&row.admin_status==='pending').length;return n;
 },{records:0,total:0,completed:0,approved:0,rejected:0,pending:0})}))};
}
export function overviewPage(m){
 return portalShell('ภาพรวมระบบประเมิน',`<p>สรุปเฉพาะหน่วยบริการที่คุณมีสิทธิ์เข้าถึง เลือกโมดูลเพื่อดูรายละเอียดและดำเนินงานต่อ</p><form method="get" class="card portal-form-card"><label>ปีงบประมาณสำหรับ MOU<input name="year" type="number" min="2500" max="2700" value="${m.year}" required></label><button class="btn" type="submit">แสดงภาพรวม</button><p class="action-hint">CTAM และ HAIT แสดงชุดข้อมูลปัจจุบันของระบบเดิม ซึ่งไม่ได้แยกปีงบประมาณ</p></form><div class="portal-account-grid">${m.modules.map(r=>{
 const percent=r.total?Math.round(r.completed/r.total*100):0;
 return `<section class="card"><p class="eyebrow">${r.module.toUpperCase()}${r.module==='mou'?' · '+m.year:''}</p><h2>${r.units} หน่วยบริการ</h2>${r.module==='mou'&&r.records===0?'<p class="read-notice">ยังไม่มีผลบันทึกในปีที่เลือก กรุณาตรวจปีงบประมาณของข้อมูลเดิม</p>':''}<p>ผ่านเกณฑ์ที่หน่วยบริการรายงาน</p><p><strong>${r.completed.toLocaleString('th-TH')} / ${r.total.toLocaleString('th-TH')} ข้อ</strong> · ${percent}%</p><progress max="100" value="${percent}" aria-label="สัดส่วนผ่านเกณฑ์ที่รายงาน ${r.module.toUpperCase()}">${percent}%</progress><p>ตรวจอนุมัติ ${r.approved.toLocaleString('th-TH')} ข้อ<br>ต้องแก้ไข ${r.rejected.toLocaleString('th-TH')} ข้อ<br>บันทึกแล้วรอตรวจ ${r.pending.toLocaleString('th-TH')} ข้อ</p>${!r.units?'<p>ไม่มีหน่วยบริการสำหรับโมดูลนี้ในสิทธิ์ของคุณ</p>':`<div class="action-links"><a class="btn primary" href="/${r.module}${r.module==='mou'?'?year='+m.year:''}">เปิดหน้าประเมิน →</a><a class="btn" href="/reports?module=${r.module}${r.module==='mou'?'&amp;year='+m.year:''}">รายงาน</a></div>`}</section>`;
 }).join('')}</div><p class="action-hint">สถานะผ่านเกณฑ์เป็นผลที่หน่วยบริการรายงาน ส่วนการตรวจอนุมัติเป็นผลพิจารณาของผู้ตรวจ ยอดนี้ไม่ใช่คะแนนรับรองมาตรฐาน</p>`,{role:m.role,path:'/overview',year:m.year});
}
