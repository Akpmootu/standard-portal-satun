import { REVIEW_LABELS } from './mou-read.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function href(m,page) {
  const p=new URLSearchParams({year:String(m.year),review:m.review,page:String(page)});
  if(m.hospitalId)p.set('hospital_id',m.hospitalId);
  if(m.progressId)p.set('progress_id',m.progressId);
  return '/mou/history?'+p;
}
export function mouHistoryContent(m) {
  const years=[...new Set([m.currentYear-1,m.currentYear,m.currentYear+1,m.year])].sort((a,b)=>a-b);
  return `<p class="read-notice">สำหรับผู้ดูแล · ประวัติแสดงผลตรวจในเวลานั้น ส่วนสถานะปัจจุบันแสดงแยกกัน การเปิดหน้านี้ไม่เปลี่ยนผลประเมิน</p>
  <form class="context-bar history-filter" method="get" action="/mou/history">
  <label>หน่วยบริการ<select name="hospital_id"><option value="">ทุกหน่วยบริการในโครงการ</option>${m.units.map(h=>`<option value="${esc(h.id)}" ${m.hospitalId===h.id?'selected':''}>${esc(h.id+' · '+h.name)}</option>`).join('')}</select></label>
  <label>ปีงบประมาณ<select name="year">${years.map(y=>`<option ${y===m.year?'selected':''}>${y}</option>`).join('')}</select></label>
  <label>ผลตรวจในประวัติ<select name="review">${[['all','ทั้งหมด'],['approved','ตรวจสอบแล้ว'],['rejected','ส่งกลับแก้ไข']].map(([v,t])=>`<option value="${v}" ${m.review===v?'selected':''}>${t}</option>`).join('')}</select></label>
  <button type="submit" class="btn primary">แสดงประวัติ</button></form>
  ${m.progressId?`<p class="read-notice">กำลังแสดงประวัติของข้อประเมินที่เลือก · การกดแสดงประวัติจะค้นหาทุกข้อด้วยตัวกรองใหม่ <a href="/mou/history?${esc(new URLSearchParams({hospital_id:m.hospitalId,year:String(m.year)}))}">ดูทุกข้อของหน่วยบริการนี้</a></p>`:''}
  <section class="read-readiness" aria-label="สรุปประวัติ"><span>ประวัติทั้งหมด <b>${m.counts.total}</b></span><span>ตรวจสอบแล้ว <b>${m.counts.approved}</b></span><span>ส่งกลับแก้ไข <b>${m.counts.rejected}</b></span><span>ข้อที่ปัจจุบันรอตรวจ <b>${m.counts.pendingParents}</b></span></section>
  <section class="history-list" aria-label="รายการประวัติการตรวจ">${m.events.length?m.events.map(e=>`<article class="card history-event"><div class="history-event-heading"><span class="badge ${e.review==='approved'?'teal':'neutral'}">${esc(REVIEW_LABELS[e.review])}</span><span class="history-date">${esc(e.createdAt)} · เวลาตามระบบเดิม</span></div><h2>${esc(e.itemNumber+' · '+e.itemTitle)}</h2><p class="history-unit">${esc(e.hospitalId+' · '+e.hospitalName)}</p><dl class="saved-detail"><dt>ข้อเสนอแนะในครั้งนี้</dt><dd>${esc(e.comment||'ไม่มีข้อความข้อเสนอแนะ')}</dd><dt>ผู้ตรวจตามบันทึก</dt><dd>${esc(e.reviewer.startsWith('legacy:')?e.reviewer.slice(7)+' (ระบบเดิม)':e.reviewer||'ไม่ระบุ')}</dd><dt>สถานะปัจจุบันของข้อประเมิน</dt><dd><strong>${esc(REVIEW_LABELS[e.currentReview])}</strong>${e.currentReview==='pending'?'<p>ผลเก่าเก็บไว้เป็นประวัติ ขณะนี้รายการอยู่ระหว่างรอตรวจ</p>':''}</dd></dl></article>`).join(''):'<section class="card empty"><h2>ไม่พบประวัติตามตัวกรองนี้</h2><p>ข้อมูลนี้ครอบคลุมประวัติที่นำเข้าแล้ว ไม่ยืนยันว่าระบบเดิมไม่มีประวัติของปีหรือหน่วยบริการอื่น</p></section>'}</section>
  <nav class="history-pagination" aria-label="หน้าประวัติ">${m.page>1?`<a class="btn" href="${esc(href(m,m.page-1))}">← หน้าก่อน</a>`:''}<span>หน้า ${m.page} / ${m.pages} · ${m.filteredCount} รายการ</span>${m.page<m.pages?`<a class="btn" href="${esc(href(m,m.page+1))}">หน้าถัดไป →</a>`:''}</nav>`;
}
