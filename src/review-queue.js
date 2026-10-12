import {portalShell} from './portal-layout.js';
import {fail} from './errors.js';
import {reviewHospitalIds} from './review-access.js';
import {currentFiscalYear} from './mou-read.js';
export async function loadReviewQueue(store,access,yearText,now=new Date()){
  fail(access?.status==='active'&&['admin','reviewer'].includes(access.user?.role),'ADMIN_REQUIRED',403);
  const year=yearText==null?currentFiscalYear(now):Number(yearText);
  fail((yearText==null||/^\d{4}$/.test(String(yearText)))&&year>=2500&&year<=2700,'INVALID_FISCAL_YEAR',400);
  const ids=reviewHospitalIds(access.user,year);
  if(!ids.length)return {year,rows:[],units:0,role:access.user.role};
  const [progress,items,directory]=await Promise.all([store.table('mou_progress'),store.table('mou_items'),store.directory(ids)]);
  const catalog=new Map(items.map(r=>[r.id,r])),names=new Map(directory.filter(r=>ids.includes(r.id)).map(r=>[r.id,r.name]));
  const seen=new Set(),rows=[];
  for(const r of progress){
    if(!ids.includes(r.hospital_id)||String(r.fiscal_year)!==String(year))continue;
    const key=r.hospital_id+':'+r.item_id;fail(!seen.has(key),'DUPLICATE_MOU_PROGRESS');seen.add(key);
    if((r.admin_status||'pending')!=='pending'||r.status==='none')continue;
    const item=catalog.get(r.item_id);fail(item,'ORPHAN_MOU_PROGRESS');
    rows.push({hospitalId:r.hospital_id,hospitalName:names.get(r.hospital_id)||r.hospital_id,itemId:r.item_id,number:item.item_number,title:item.title,updatedAt:r.updated_at});
  }
  rows.sort((a,b)=>String(a.updatedAt).localeCompare(String(b.updatedAt))||a.hospitalId.localeCompare(b.hospitalId)||String(a.number).localeCompare(String(b.number),undefined,{numeric:true}));
  return {year,rows,units:ids.length,role:access.user.role};
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function reviewQueuePage(model,{preview=false}={}){
  return portalShell('งานรอตรวจ MOU',`${preview?'<p>ข้อมูลสมมติเท่านั้น ไม่เชื่อม Google</p>':''}<p>แสดงเฉพาะหน่วยบริการและปีที่คุณมีสิทธิ์ตรวจ เรียงรายการเก่าก่อน</p><form method="get"><label>ปีงบประมาณ<input name="year" type="number" min="2500" max="2700" value="${model.year}" required></label><button class="btn" type="submit">แสดงงานรอตรวจ</button></form><p>${model.rows.length} รายการ · ${model.units} หน่วยบริการในขอบเขต</p>${model.rows.length?model.rows.map(r=>`<section class="card"><p>${esc(r.hospitalId+' · '+r.hospitalName)}</p><h2>${esc(r.number+' · '+r.title)}</h2><p>บันทึกเมื่อ ${esc(r.updatedAt)}</p><a class="btn primary" href="/mou/action?${esc(new URLSearchParams({hospital_id:r.hospitalId,year:String(model.year),item_id:r.itemId,action:'review'}))}">ตรวจผลประเมิน</a></section>`).join(''):'<p role="status">ไม่มีงานรอตรวจในขอบเขตที่ได้รับมอบหมายสำหรับปีนี้</p>'}`,{path:'/mou/reviews',role:model.role||'reviewer',year:model.year});
}
