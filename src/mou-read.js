import {reviewHospitalIds} from './review-access.js';
import { fail } from './errors.js';
import { requireHospital } from './authorization.js';
import { MOU_HOSPITAL_IDS } from './mou-reference.js';
import { normalizeAgencies } from './mou-agencies.js';

export const STATUS_LABELS={none:'ยังไม่ประเมิน',completed:'มี / ผ่านเกณฑ์',in_progress:'กำลังดำเนินการ',cannot_do:'ไม่มี / ไม่ผ่านเกณฑ์'};
export const REVIEW_LABELS={pending:'รอตรวจสอบ',approved:'ตรวจสอบแล้ว',rejected:'ต้องแก้ไข'};
export const PERIOD_LABELS={all:'ตลอดปี','6_months':'รอบ 6 เดือน','9_12_months':'รอบ 9 / 12 เดือน','12_months':'รอบ 12 เดือน'};
const SETTINGS=['allow_6months_edit','allow_9_12months_edit'];
export function currentFiscalYear(now=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'numeric'}).formatToParts(now).map(p=>[p.type,p.value]));
  return Number(parts.year)+543+(Number(parts.month)>=10?1:0);
}
function text(value,max=10000) {fail(typeof value==='string'&&value.length<=max,'INVALID_MOU_DATA');return value;}
function integer(value) {fail(String(value).trim()!==''&&Number.isSafeInteger(Number(value)),'INVALID_MOU_DATA');return Number(value);}
function unique(records,key) {const seen=new Set();for(const r of records){fail(!seen.has(r[key]),'DUPLICATE_MOU_REFERENCE');seen.add(r[key]);}}
export function safeEvidenceUrl(value) {
  if(typeof value!=='string'||value.length>2048)return '';
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
export function legacyLock(item,group,year,settings,currentYear=currentFiscalYear()) {
  if(!['PHO','DHO','PCU','HOSPITAL'].includes(group))return 'รอตรวจประเภทหน่วยบริการ';
  const category=String(item.categoryNumber),number=item.number;
  if(group==='DHO'&&!['1','3','5'].includes(category)||group==='PCU'&&category==='2')return 'หน่วยบริการประเภทนี้ไม่ต้องประเมินหมวดนี้';
  if(group==='HOSPITAL'&&['5.1','5.2','5.3','5.4','5.5','5.6'].includes(number))return 'ประเมินผ่านระบบ CTAM+';
  if(['DHO','PCU'].includes(group)&&number==='3.1'||group==='PCU'&&['4.1','4.2'].includes(number))return 'ไม่ต้องประเมินข้อนี้';
  if(year!==currentYear)return 'ไม่ใช่ปีงบประมาณปัจจุบัน';
  if(item.period==='6_months'&&!settings.six)return 'ปิดรับข้อมูลรอบ 6 เดือน';
  if(['9_12_months','12_months'].includes(item.period)&&!settings.later)return 'ปิดรับข้อมูลรอบ 9 / 12 เดือน';
  return '';
}
export function normalizeCatalog(categoryRows,itemRows,settingRows) {
  const categories=categoryRows.map(r=>({id:text(r.id,50),number:integer(r.category_number),title:text(r.title,500),order:integer(r.sort_order)}));
  unique(categories,'id');unique(categories,'number');
  fail(categories.every(c=>c.id&&c.title.trim()&&c.number>=1&&c.number<=6),'INVALID_MOU_DATA');
  const byId=new Map(categories.map(c=>[c.id,c]));
  const items=itemRows.map(r=>{
    fail(byId.has(r.category_id),'MOU_CATEGORY_NOT_FOUND');
    fail(Object.hasOwn(PERIOD_LABELS,r.period)&&['hospital','pcu','all'].includes(r.target_group),'INVALID_MOU_DATA');
    const value={id:text(r.id,50),categoryId:r.category_id,categoryNumber:byId.get(r.category_id).number,number:text(r.item_number,10),title:text(r.title),period:r.period,targetGroup:r.target_group,order:integer(r.sort_order)};
    fail(value.id&&value.title.trim()&&/^\d+\.\d+$/.test(value.number),'INVALID_MOU_DATA');
    return value;
  });
  unique(items,'id');unique(items,'number');
  unique(settingRows,'setting_key');
  const settings={six:false,later:false,complete:SETTINGS.every(key=>settingRows.some(r=>r.setting_key===key))};
  for(const r of settingRows){if(!SETTINGS.includes(r.setting_key))continue;fail(['0','1',0,1].includes(r.setting_value),'INVALID_MOU_SETTING');settings[r.setting_key===SETTINGS[0]?'six':'later']=String(r.setting_value)==='1';}
  categories.sort((a,b)=>a.order-b.order||a.number-b.number);items.sort((a,b)=>a.order-b.order||a.number.localeCompare(b.number,undefined,{numeric:true}));
  return {categories,items,settings};
}
export async function loadMouWorkspace(store,access,query={},now=new Date()) {
  fail(access?.status==='active','APPROVAL_REQUIRED',403);
  const currentYear=currentFiscalYear(now),year=query.year==null?currentYear:Number(query.year);
  fail(query.year==null||/^\d{4}$/.test(String(query.year)),'INVALID_FISCAL_YEAR',400);
  fail(year>=2500&&year<=2700,'INVALID_FISCAL_YEAR',400);
  fail(query.category==null||/^\d{1,10}$/.test(query.category),'INVALID_CATEGORY',400);
  const filter=query.filter||'all';fail(['all','none','rejected','completed','in_progress','cannot_do'].includes(filter),'INVALID_FILTER',400);
  const hospitalId=query.hospitalId|| (access.user.role==='hospital'?access.user.hospitalId:'');
  if(hospitalId)requireHospital(access,hospitalId,year);
  const ids=reviewHospitalIds(access.user,year);
  if(hospitalId)fail(ids.includes(hospitalId),'HOSPITAL_OUTSIDE_PROJECT',403);
  // Authorization happens before any directory/catalog/assessment read. No shared access cache.
  const names=['mou_categories','mou_items','mou_settings','mou_agencies'];
  await store.prefetch?.([...names,...(hospitalId?['mou_progress']:[])]);
  const [directory,referenceRows]=await Promise.all([
    store.directory(ids),store.tables?store.tables(names):Promise.all(names.map(name=>store.table(name))),
  ]);
  const [categoryRows,itemRows,settingRows,agencyRows]=referenceRows;
  const catalog=normalizeCatalog(categoryRows,itemRows,settingRows);
  const agencies=normalizeAgencies(agencyRows);
  const units=directory.filter(h=>ids.includes(h.id)).map(h=>{
    const classification=agencies.get(h.id)||{type:'รอตรวจประเภทหน่วยบริการ',group:'UNKNOWN'};
    return {id:h.id,name:h.name,...classification};
  }).sort((a,b)=>a.name.localeCompare(b.name,'th'));
  const unit=units.find(h=>h.id===hospitalId)||null;
  const warnings=[];
  if(!units.length)warnings.push('ยังไม่มีข้อมูลหน่วยบริการที่คุณมีสิทธิ์ในชีตอ้างอิง');
  if(hospitalId&&!unit)warnings.push('ยังไม่พบรหัสหน่วยบริการที่เลือกในชีตอ้างอิง');
  if(!catalog.categories.length||!catalog.items.length)warnings.push('ยังไม่มีหมวดหรือตัวชี้วัด MOU ใน Google Sheets — รอนำเข้ารายการจากระบบเดิม');
  if(!catalog.settings.complete)warnings.push('ยังนำเข้าการตั้งค่ารอบประเมินไม่ครบ ระบบถือว่ารอบที่ขาดปิดอยู่');
  if(unit?.group==='UNKNOWN')warnings.push('ประเภทหน่วยบริการยังไม่ชัดเจน ต้องตรวจตาราง mou_agencies ก่อนเปิดประเมิน (ไม่ใช่การเพิ่มสิทธิ์ผู้ใช้)');
  const visible=catalog.items.filter(i=>unit?.group!=='HOSPITAL'||i.categoryNumber!==6);
  const categories=catalog.categories.filter(c=>unit?.group!=='HOSPITAL'||c.number!==6);
  const category=query.category?categories.find(c=>c.id===query.category):categories[0];
  if(query.category)fail(category,'CATEGORY_NOT_FOUND',400);
  const records=new Map();
  if(unit && catalog.items.length){
    const rows=await store.table('mou_progress');
    const known=new Set(catalog.items.map(i=>i.id));
    for(const r of rows){
      if(r.hospital_id!==hospitalId||String(r.fiscal_year)!==String(year))continue;
      fail(known.has(r.item_id),'ORPHAN_MOU_PROGRESS');
      fail(!records.has(r.item_id),'DUPLICATE_MOU_PROGRESS');
      fail(Object.hasOwn(STATUS_LABELS,r.status),'INVALID_MOU_STATUS');
      const review=r.admin_status||'pending';fail(Object.hasOwn(REVIEW_LABELS,review),'INVALID_REVIEW_STATUS');
      records.set(r.item_id,{id:r.id,version:r._version,status:r.status,review,detail:text(r.assessment_detail),link:safeEvidenceUrl(r.evidence_link),invalidLink:Boolean(r.evidence_link&&!safeEvidenceUrl(r.evidence_link)),comment:text(r.admin_comment),updatedAt:text(r.updated_at,100),hasFile:Boolean(r.evidence_file),fileId:r.evidence_file});
    }
  }
  const displayed=visible.map(i=>({...i,record:records.get(i.id)||null,lock:legacyLock(i,unit?.group,year,catalog.settings,currentYear)}));
  const total=displayed.length,counts={completed:0,in_progress:0,cannot_do:0,none:0,rejected:0};
  for(const i of displayed){counts[i.record?.status||'none']++;if(i.record?.review==='rejected')counts.rejected++;}
  return {readOnly:true,isAdmin:access.user.role==='admin',canReview:['admin','reviewer'].includes(access.user.role),isReviewer:access.user.role==='reviewer',source:'google-sheets',checkedAt:now.toISOString(),currentYear,year,hospitalId,units,unit,categories,category:category||null,filter,items:displayed,settings:catalog.settings,warnings,
    counts:{...counts,total,percent:total?Math.round(counts.completed/total*100):0},hasRecords:records.size>0};
}
