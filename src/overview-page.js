import {loadReport} from './reports.js';
import {portalShell} from './portal-layout.js';
import {fail} from './errors.js';
import {currentFiscalYear} from './mou-read.js';

export async function loadOverview(store,access,yearText){
 fail(access?.status==='active','APPROVAL_REQUIRED',403);
 const year=yearText==null?currentFiscalYear():Number(yearText);
 fail((yearText==null||/^\d{4}$/.test(String(yearText)))&&year>=2500&&year<=2700,'INVALID_FISCAL_YEAR',400);
 const modules=access.user.role==='reviewer'?['mou']:['mou','ctam','hait'];
 await store.prefetch?.(['mou_agencies','mou_categories','mou_items','mou_settings','mou_progress',...(modules.length>1?['ctam_items','ctam_progress','rg12_sub_items','rg12_progress']:[])]);
 // Reuse reads only within this overview request; never cache identity or role state.
 const tables=new Map(),directories=new Map();
 const scopedStore={table(name){if(!tables.has(name))tables.set(name,store.table(name));return tables.get(name);},directory(ids){const key=JSON.stringify(ids);if(!directories.has(key))directories.set(key,store.directory(ids));return directories.get(key);}};
 const reports=await Promise.all(modules.map(module=>loadReport(scopedStore,access,{module,year})));
 return {role:access.user.role,year,modules:reports.map(m=>({module:m.module,units:m.results.length,...m.results.reduce((n,r)=>{
  n.records+=r.records.length;n.total+=r.total;n.completed+=r.completed;n.approved+=r.approved;n.rejected+=r.rejected;n.pending+=r.records.filter(row=>row.status!=='none'&&row.admin_status==='pending').length;return n;
 },{records:0,total:0,completed:0,approved:0,rejected:0,pending:0})}))};
}
export function overviewPage(m){
 const number=n=>Number(n).toLocaleString('th-TH');
 const totals=m.modules.reduce((a,r)=>{for(const k of ['approved','pending','rejected'])a[k]+=r[k];return a;},{approved:0,pending:0,rejected:0});
 const descriptions={mou:['พัฒนาบุคลากรดิจิทัล','ติดตามการพัฒนาศักยภาพบุคลากร ตามข้อตกลงและรอบประเมิน'],ctam:['ความมั่นคงปลอดภัยไซเบอร์','ประเมินความพร้อมและมาตรการดูแลระบบสารสนเทศ'],hait:['มาตรฐานเทคโนโลยีสารสนเทศ','พัฒนาคุณภาพระบบสารสนเทศของหน่วยบริการ']};
 return portalShell('ภาพรวมระบบประเมิน',`<section class="overview-hero"><div><p class="eyebrow">SATUN · DIGITAL HEALTH WORKSPACE</p><h1>ทุกการพัฒนา<br><span>มองเห็นได้ในที่เดียว</span></h1><p>ติดตามผลประเมิน จัดการหลักฐาน และเดินหน้าสู่มาตรฐานสุขภาพดิจิทัล<br>ข้อมูลแสดงเฉพาะหน่วยบริการที่คุณมีสิทธิ์เข้าถึง</p><a class="btn light" href="/resources">คู่มือและแนวทางประเมิน <span aria-hidden="true">↗</span></a></div><div class="overview-period"><span class="period-label">ปีงบประมาณ MOU</span><strong>${m.year}</strong><span>STANDARD PORTAL</span><p>พื้นที่ทำงานร่วมกัน<br>เพื่อสุขภาพดิจิทัลจังหวัดสตูล</p></div></section>
 <section class="overview-stats" aria-label="สรุปสถานะการตรวจตามสิทธิ์"><div><span class="stat-dot approved"></span><p>ตรวจอนุมัติแล้ว</p><strong>${number(totals.approved)} <small>ข้อ</small></strong></div><div><span class="stat-dot pending"></span><p>บันทึกแล้วรอตรวจ</p><strong>${number(totals.pending)} <small>ข้อ</small></strong></div><div><span class="stat-dot rejected"></span><p>ส่งกลับเพื่อแก้ไข</p><strong>${number(totals.rejected)} <small>ข้อ</small></strong></div><div><span class="stat-dot"></span><p>โมดูลในสิทธิ์ของคุณ</p><strong>${m.modules.length} <small>โมดูล</small></strong></div></section>
 <div class="overview-section-head"><div><p class="eyebrow">YOUR ASSESSMENTS</p><h2>เลือกงานประเมิน</h2><p>ดูความคืบหน้า แล้วเริ่มงานต่อจากโมดูลที่ต้องการ</p></div><form method="get" class="overview-year"><label for="overview-year">ปีงบประมาณ MOU</label><div><input id="overview-year" name="year" type="number" min="2500" max="2700" value="${m.year}" required><button class="btn" type="submit">แสดงผล</button></div></form></div>
 <div class="portal-account-grid overview-modules">${m.modules.map(r=>{
 const percent=r.total?Math.round(r.completed/r.total*100):0,desc=descriptions[r.module];
 return `<section class="card overview-module ${r.module}"><div class="module-card-top"><span class="module-monogram">${r.module.toUpperCase()}</span><span>${r.module==='mou'?'ปี '+m.year:'ชุดข้อมูลปัจจุบัน'}</span></div><h2>${desc[0]}</h2><p class="module-description">${desc[1]}</p><p class="module-coverage">${number(r.units)} หน่วยบริการในสิทธิ์</p><div class="module-completion"><strong>${percent}<small>%</small></strong><span>ผ่านเกณฑ์ที่หน่วยบริการรายงาน<br><b>${number(r.completed)} / ${number(r.total)} ข้อ</b></span></div><progress max="100" value="${percent}" aria-label="สัดส่วนผ่านเกณฑ์ที่รายงาน ${r.module.toUpperCase()}">${percent}%</progress>${r.module==='mou'&&r.records===0?'<p class="read-notice">ยังไม่มีผลบันทึกในปีที่เลือก กรุณาตรวจปีงบประมาณของข้อมูลเดิม</p>':''}<dl class="module-review-counts"><div><dt>อนุมัติ</dt><dd>${number(r.approved)}</dd></div><div><dt>รอตรวจ</dt><dd>${number(r.pending)}</dd></div><div><dt>แก้ไข</dt><dd>${number(r.rejected)}</dd></div></dl>${!r.units?'<p>ไม่มีหน่วยบริการสำหรับโมดูลนี้ในสิทธิ์ของคุณ</p>':`<div class="action-links"><a class="btn primary" href="/${r.module}${r.module==='mou'?'?year='+m.year:''}">เปิดหน้าประเมิน →</a><a class="btn" href="/reports?module=${r.module}${r.module==='mou'?'&amp;year='+m.year:''}">รายงาน</a></div>`}</section>`;
 }).join('')}</div><div class="overview-note"><strong>อ่านข้อมูลอย่างเข้าใจ</strong><p>สถานะผ่านเกณฑ์เป็นผลที่หน่วยบริการรายงาน ส่วนการตรวจอนุมัติเป็นผลพิจารณาของผู้ตรวจ ยอดนี้ไม่ใช่คะแนนรับรองมาตรฐาน</p><p>CTAM และ HAIT แสดงชุดข้อมูลปัจจุบันของระบบเดิม ซึ่งไม่ได้แยกปีงบประมาณ</p></div>`,{role:m.role,path:'/overview',year:m.year,heading:false});
}
