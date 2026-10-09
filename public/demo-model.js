// Synthetic fixtures only. Never import production records or OAuth/session data here.
export const categories = [
  ['1', 'บุคลากรสุขภาพดิจิทัล', 'Digital Workforce'], ['2', 'ระบบบริการดิจิทัล', 'Digital Services'],
  ['3', 'ข้อมูลและสารสนเทศ', 'Data & Information'], ['4', 'เทคโนโลยีและโครงสร้างพื้นฐาน', 'Infrastructure'],
  ['5', 'ความมั่นคงปลอดภัยไซเบอร์', 'Cybersecurity'], ['6', 'มาตรฐานหน่วยบริการปฐมภูมิ', 'PCU Standard'],
].map(([id,title,subtitle])=>({id,title,subtitle}));
export const hospitals = [
  {id:'DEMO-PCU',name:'หน่วยบริการตัวอย่าง A',group:'PCU',type:'โรงพยาบาลส่งเสริมสุขภาพตำบล'},
  {id:'DEMO-HOSP',name:'หน่วยบริการตัวอย่าง B',group:'HOSPITAL',type:'โรงพยาบาล'},
  {id:'DEMO-DHO',name:'หน่วยบริการตัวอย่าง C',group:'DHO',type:'สำนักงานสาธารณสุขอำเภอ'},
  {id:'DEMO-PHO',name:'หน่วยบริการตัวอย่าง D',group:'PHO',type:'สำนักงานสาธารณสุขจังหวัด'},
];
export const items = [
  ['1.1','จัดตั้งคณะกรรมการพัฒนาบุคลากรสุขภาพดิจิทัล','6_months'],
  ['1.2','จัดทำแผนพัฒนาบุคลากรด้านสุขภาพดิจิทัล','6_months'],
  ['1.3','พัฒนาทักษะดิจิทัลกลุ่มผู้บริหารและหัวหน้ากลุ่มงาน','9_12_months'],
  ['1.4','พัฒนาทักษะเฉพาะทางกลุ่มบุคลากร IT / สุขภาพดิจิทัล','9_12_months'],
  ['1.5','พัฒนาทักษะดิจิทัลสำหรับบุคลากรทั่วไป','9_12_months'],
  ['2.1','ทบทวนกระบวนการให้บริการดิจิทัล','all_year'], ['2.2','ติดตามการใช้บริการดิจิทัล','12_months'],
  ['3.1','กำกับดูแลมาตรฐานข้อมูลของหน่วยบริการ','all_year'], ['3.2','ตรวจสอบคุณภาพและความครบถ้วนของข้อมูล','9_12_months'],
  ['4.1','ทบทวนแผนพัฒนาโครงสร้างพื้นฐาน','6_months'], ['4.2','ตรวจความพร้อมของระบบเทคโนโลยี','all_year'],
  ['4.3','จัดทำทะเบียนอุปกรณ์และแผนบำรุงรักษา','9_12_months'],
  ['5.1','ทบทวนนโยบายความมั่นคงปลอดภัย','6_months'], ['5.2','ประเมินความเสี่ยงด้านไซเบอร์','9_12_months'],
  ['5.6','ซ้อมแผนรับมือเหตุการณ์และกู้คืนระบบ','12_months'],
  ['6.1','ทบทวนความพร้อมตามมาตรฐานบริการปฐมภูมิ','all_year'], ['6.2','สรุปผลพัฒนาคุณภาพบริการปฐมภูมิ','12_months'],
].map(([id,title,period])=>({id,category:id.split('.')[0],title,period}));
export const statuses = {none:'ยังไม่ประเมิน',completed:'มี / ผ่านเกณฑ์',in_progress:'กำลังดำเนินการ',cannot_do:'ไม่มี / ไม่ผ่านเกณฑ์'};
export const reviews = {pending:'รอตรวจสอบ',approved:'ตรวจสอบแล้ว',rejected:'ต้องแก้ไข'};
export const periods = {all_year:'ประเมินตลอดปี','6_months':'รอบ 6 เดือน','9_12_months':'รอบ 9 / 12 เดือน','12_months':'รอบ 12 เดือน'};
export function fiscalYear(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',year:'numeric',month:'numeric'}).formatToParts(now).map(p=>[p.type,p.value]));
  return Number(parts.year)+543+(Number(parts.month)>=10?1:0);
}
export function visibleItems(group) { return items.filter(i=>group!=='HOSPITAL'||i.category!=='6'); }
// Mirrors the legacy page's target-agency restrictions, including for an admin preview.
// The old save API's admin bypass differs and must be resolved before enabling real writes.
export function lockReason(item, group, year, settings, currentYear = fiscalYear()) {
  if (group==='DHO'&&!['1','3','5'].includes(item.category)) return 'หน่วยบริการประเภทนี้ไม่ต้องประเมินหมวดนี้';
  if (group==='PCU'&&!['1','3','4','5','6'].includes(item.category)) return 'หน่วยบริการประเภทนี้ไม่ต้องประเมินหมวดนี้';
  if (group==='HOSPITAL'&&item.category==='6') return 'หมวดนี้สำหรับหน่วยบริการปฐมภูมิ';
  if (group==='HOSPITAL'&&['5.1','5.2','5.3','5.4','5.5','5.6'].includes(item.id)) return 'ประเมินผ่านระบบ CTAM+';
  if (['DHO','PCU'].includes(group)&&item.id==='3.1') return 'ไม่ต้องประเมินข้อนี้';
  if (group==='PCU'&&['4.1','4.2'].includes(item.id)) return 'ไม่ต้องประเมินข้อนี้';
  if (Number(year)!==Number(currentYear)) return 'เปิดอ่านได้ แต่ประเมินปีนี้ไม่ได้';
  if (item.period==='6_months'&&!settings.six) return 'ปิดรับข้อมูลรอบ 6 เดือน';
  if (['9_12_months','12_months'].includes(item.period)&&!settings.later) return 'ปิดรับข้อมูลรอบ 9 / 12 เดือน';
  return '';
}
export function seedRecords() {
  const records={};
  hospitals.forEach((h,hi)=>items.forEach((item,n)=>{
    const status = n<2?'completed':n===3?'in_progress':[ 'none','in_progress','completed','none','cannot_do'][(n+hi)%5];
    records[`${h.id}:${item.id}`]={status,detail:status==='none'?'':'ตัวอย่างผลการดำเนินงานสำหรับทดสอบหน้าจอเท่านั้น ไม่ใช่ผลประเมินของหน่วยบริการจริง',link:status==='none'?'':'https://example.org/demo-evidence',review:status==='none'?'pending':n<2?'approved':n===3?'rejected':'pending',comment:n===3?'ตัวอย่างข้อเสนอแนะ: กรุณาระบุช่วงเวลาและผลการดำเนินงานให้ครบถ้วน':''};
  })); return records;
}
export function summary(list, getRecord) {
  const result={total:list.length,completed:0,in_progress:0,cannot_do:0,none:0,rejected:0};
  list.forEach(i=>{const r=getRecord(i);result[Object.hasOwn(statuses,r?.status)?r.status:'none']++;if(r?.review==='rejected'&&r.status!=='none')result.rejected++;});
  result.percent=result.total?Math.round(result.completed/result.total*100):0;return result;
}
export function validateAssessment(record) {
  if (!['completed','in_progress','cannot_do'].includes(record.status)) return 'กรุณาเลือกสถานะการดำเนินงาน';
  if (!record.detail?.trim()) return 'กรุณากรอกรายละเอียดการประเมิน';
  if (record.detail.length>5000) return 'รายละเอียดต้องไม่เกิน 5,000 ตัวอักษร';
  try { const u=new URL(record.link); if(!['https:','http:'].includes(u.protocol)||u.username||u.password||record.link.length>2048)throw Error(); }
  catch { return 'กรุณาระบุลิงก์หลักฐานแบบ https:// หรือ http:// ที่ถูกต้อง'; }
  return '';
}
