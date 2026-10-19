// Native dialog provides keyboard focus handling and Escape-to-close.
const guide=document.querySelector('#getting-started');
document.querySelector('a[href="#getting-started"]')?.addEventListener('click',event=>{
 if(guide instanceof HTMLDialogElement){event.preventDefault();guide.showModal();}
});

if(location.hash==='#getting-started'&&guide instanceof HTMLDialogElement)guide.showModal();

const progressGrid=document.querySelector('.public-chart-grid');
if(progressGrid){
 const refresh=document.querySelector('[data-public-refresh]'),status=document.querySelector('[data-public-status]'),updated=document.querySelector('[data-public-updated]');
 const metricLabels={assessmentPercent:'ความคืบหน้าการบันทึก',passedPercent:'ผ่านเกณฑ์ตามรายงาน',approvedPercent:'ตรวจอนุมัติแล้ว'};
 const countKeys={assessmentPercent:'assessed',passedPercent:'passed',approvedPercent:'approved'};
 const fmt=n=>new Intl.NumberFormat('th-TH',{maximumFractionDigits:1}).format(n);
 let snapshot=null,metric='assessmentPercent',busy=false,failures=0,nextAt=0;
 const render=()=>{if(!snapshot)return;
  for(const row of snapshot.modules){const card=progressGrid.querySelector('[data-public-module="'+row.module+'"]');if(!card)continue;
   card.querySelector('[data-public-percent]').textContent=fmt(row[metric])+'%';card.querySelector('[data-public-metric-label]').textContent=metricLabels[metric];
   card.querySelector('.donut-value').setAttribute('stroke-dasharray',row[metric]+' 100');
   card.querySelector('[data-public-count]').textContent=fmt(row[countKeys[metric]])+' / '+fmt(row.total)+' ข้อ'+(row.total===0?' · ยังไม่มีเกณฑ์ในชุดข้อมูล':'');
   card.querySelector('[data-public-passed]').textContent=fmt(row.passedPercent)+'%';card.querySelector('[data-public-approved]').textContent=fmt(row.approvedPercent)+'%';
   card.querySelector('[data-public-units]').textContent=fmt(row.units)+' หน่วยบริการ';card.querySelector('[data-public-period]').textContent=row.module==='mou'?'ปี '+snapshot.fiscalYear:'ข้อมูลปัจจุบัน';
  }
  updated.textContent='ข้อมูล ณ '+new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(snapshot.updatedAt));
 };
 const valid=data=>data&&Number.isInteger(data.fiscalYear)&&Number.isFinite(Date.parse(data.updatedAt))&&Array.isArray(data.modules)&&data.modules.length===3&&new Set(data.modules.map(r=>r.module)).size===3&&data.modules.every(r=>['mou','ctam','hait'].includes(r.module)&&['units','total','assessed','passed','approved'].every(k=>Number.isInteger(r[k])&&r[k]>=0)&&['assessmentPercent','passedPercent','approvedPercent'].every(k=>Number.isFinite(r[k])&&r[k]>=0&&r[k]<=100));
 async function read(){if(busy)return;busy=true;refresh.disabled=true;progressGrid.setAttribute('aria-busy','true');status.textContent='กำลังอ่านข้อมูลล่าสุด…';
  try{const response=await fetch('/api/public/progress',{credentials:'omit',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('UNAVAILABLE');const data=await response.json();if(!valid(data))throw Error('INVALID_SUMMARY');snapshot=data;render();failures=0;
   const stale=data.stale===true||Date.now()-Date.parse(data.updatedAt)>120000;status.textContent=stale?'แสดงข้อมูลที่อ่านได้ล่าสุด ขณะนี้ยังอัปเดตจากต้นทางไม่ได้':'อัปเดตอัตโนมัติทุก 60 วินาที · แสดงเฉพาะข้อมูลรวมระดับจังหวัด';status.classList.toggle('is-error',stale);updated.closest('.public-live').classList.toggle('is-stale',stale);
  }catch{failures++;status.textContent=snapshot?'ยังอัปเดตไม่ได้ กราฟคงข้อมูลเดิมตามเวลาที่แสดง กรุณาลองอีกครั้ง':'ยังอ่านข้อมูลไม่ได้ กรุณาลองอีกครั้ง — ไม่แสดงยอดเป็นศูนย์แทนข้อมูลที่ขาด';status.classList.add('is-error');updated.closest('.public-live').classList.add('is-stale');if(!snapshot)updated.textContent='ข้อมูลยังไม่พร้อม';}
  finally{busy=false;refresh.disabled=false;progressGrid.setAttribute('aria-busy','false');nextAt=Date.now()+Math.min(300000,60000*2**Math.min(failures,3));}
 }
 for(const button of document.querySelectorAll('[data-public-metric]'))button.addEventListener('click',()=>{metric=button.dataset.publicMetric;for(const b of document.querySelectorAll('[data-public-metric]'))b.setAttribute('aria-pressed',String(b===button));render();});
 refresh.addEventListener('click',read);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()>=nextAt)read();});
 setInterval(()=>{if(!document.hidden&&Date.now()>=nextAt)read();},5000);read();
}
