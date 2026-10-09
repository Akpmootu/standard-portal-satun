import { categories, hospitals, items, statuses, reviews, periods, fiscalYear, visibleItems, lockReason, seedRecords, summary, validateAssessment } from './demo-model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = { grid:'▦', list:'☷', arrow:'↗', check:'✓', clock:'◷', lock:'⊘' };
const root = document.querySelector('#workspace');
const base = document.body.dataset.base;
const currentYear = fiscalYear();
const state = { view:document.body.dataset.view, hospital:'DEMO-PCU', year:currentYear, category:'1', settings:{six:false,later:true}, records:seedRecords(), query:'', filter:'all', editing:new Set(), open:new Set(), dirty:false };
let toastTimer;
const drafts=new Map();
const hospital = () => hospitals.find(h=>h.id===state.hospital);
const record = (id, unit=state.hospital) => state.year===currentYear ? state.records[`${unit}:${id}`] : {status:'none',review:'pending',detail:'',link:''};
const totals = (unit=state.hospital) => summary(visibleItems(hospitals.find(h=>h.id===unit).group),i=>record(i.id,unit));
const locked = item => lockReason(item,hospital().group,state.year,state.settings,currentYear);
const badge = (text,kind='neutral') => `<span class="badge ${esc(kind)}">${esc(text)}</span>`;
const progress = (value,label) => `<progress max="100" value="${value}" aria-label="${esc(label)}">${value}%</progress>`;
const link = (view,text,extra='') => `<a href="${base}/${view}" data-nav="${view}" ${extra}>${text}</a>`;

function notify(message) {
  const el=document.querySelector('#toast'); el.textContent=message; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('visible'),4500);
}
function confirmAction(message) {
  const dialog=document.querySelector('#confirm-dialog');
  document.querySelector('#confirm-description').textContent=message;
  dialog.showModal();
  return new Promise(resolve=>{
    const finish=value=>{dialog.close();dialog.oncancel=null;resolve(value);};
    document.querySelector('#confirm-no').onclick=()=>finish(false);
    document.querySelector('#confirm-yes').onclick=()=>finish(true);
    dialog.oncancel=e=>{e.preventDefault();finish(false);};
  });
}
async function discardDrafts() {
  if(state.dirty&&!await confirmAction('มีข้อมูลที่ยังไม่ได้จำลองบันทึก ต้องการทิ้งการแก้ไขและไปต่อหรือไม่?'))return false;
  state.dirty=false; drafts.clear(); state.editing.clear(); return true;
}
function shell() {
 document.title=`${state.view==='mou'?'ประเมิน MOU':'Dashboard'} · Standard Portal · ข้อมูลจำลอง`;
 root.innerHTML=`<a class="skip" href="#main">ข้ามไปเนื้อหา</a><aside class="sidebar" aria-label="เมนูหลัก">
  <a class="brand" href="${base}/dashboard" data-nav="dashboard"><span class="brand-icon">S<span>+</span></span><span>STANDARD PORTAL<small>DIGITAL HEALTH · SATUN</small></span></a>
  <p class="nav-label">พื้นที่ทำงาน</p><nav>${link('dashboard',`${icons.grid} <span>ภาพรวม Dashboard</span>`,`class="nav-link ${state.view==='dashboard'?'selected':''}" ${state.view==='dashboard'?'aria-current="page"':''}`)}${link('mou',`${icons.list} <span>ประเมิน MOU ดิจิทัล</span>`,`class="nav-link ${state.view==='mou'?'selected':''}" ${state.view==='mou'?'aria-current="page"':''}`)}</nav>
  <p class="nav-label">มาตรฐานอื่น · ขั้นถัดไป</p><div class="nav-disabled">◈ <span>ประเมิน CTAM</span><small>เตรียมย้าย</small></div><div class="nav-disabled">◇ <span>ประเมิน HAIT</span><small>เตรียมย้าย</small></div>
  <div class="sidebar-note"><span class="live-dot"></span> พื้นที่ทดลอง UI<p>ตรวจขั้นตอนก่อนเชื่อมข้อมูลจริง<br>ไม่กระทบระบบเดิม</p></div><a class="account-link" href="/">⚙ <span>บัญชีและการเชื่อมต่อ</span> ↗</a></aside>
  <div class="page"><header class="topbar"><div><button id="menu-toggle" class="icon-button" aria-label="เปิดเมนู" aria-expanded="false">☰</button><span class="breadcrumb">พื้นที่ทำงาน <span>/</span> <strong>${state.view==='mou'?'ประเมิน MOU':'ภาพรวม'}</strong></span></div><span class="environment"><i></i> LOCAL DEMO</span></header>
  <main id="main" tabindex="-1"><div class="demo-banner"><span class="demo-mark">i</span><div><strong>ข้อมูลจำลองสำหรับตรวจหน้าจอ</strong><span>ไม่ใช่ข้อมูลจริง · ไม่ส่งข้อมูลไป Sheets / Drive · รีเฟรชแล้วผลที่ทดลองบันทึกจะหาย</span></div><button class="text-button" id="reset-demo">เริ่มทดลองใหม่ ↺</button></div>
  <section class="page-heading"><div><p class="eyebrow">${state.view==='mou'?'DIGITAL MOU ASSESSMENT':'YOUR DIGITAL HEALTH WORKSPACE'}</p><h1>${state.view==='mou'?'ประเมิน MOU ดิจิทัล':'ภาพรวมการพัฒนาดิจิทัล'}</h1><p>${state.view==='mou'?'ประเมินทีละข้อ แนบลิงก์หลักฐาน และติดตามผลตรวจในที่เดียว':'เห็นความคืบหน้า งานที่ต้องติดตาม และเริ่มประเมินต่อได้ทันที'}</p></div>${state.view==='dashboard'?link('mou',`เริ่มประเมิน MOU <span>→</span>`,'class="btn primary"'):'<span class="badge teal large">MOU · ปี '+state.year+'</span>'}</section>
  <div class="context-bar"><label>หน่วยบริการ<select id="hospital">${hospitals.map(h=>`<option value="${h.id}" ${h.id===state.hospital?'selected':''}>${h.name} · ${h.type}</option>`).join('')}</select></label><label>ปีงบประมาณ<select id="year">${[currentYear-1,currentYear,currentYear+1].map(y=>`<option ${state.year===y?'selected':''}>${y}</option>`).join('')}</select></label><div class="context-caption"><span class="live-dot"></span> ${state.year===currentYear?'ปีประเมินปัจจุบัน':'เปิดดูเท่านั้น · ปีนอกช่วงประเมิน'}<small>ประเภทหน่วยบริการ: ${esc(hospital().group)}</small></div></div>
  <div id="view-content">${state.view==='dashboard'?dashboard():assessment()}</div>
  <footer>STANDARD PORTAL <span>ต้นแบบระบบใหม่ · ขั้นที่ 1 / Dashboard & MOU</span></footer></main></div>`;
 bind();
}
function dashboard() {
 const s=totals();
 const cards=[['ตัวชี้วัดที่แสดง',s.total,'รวมข้อที่ล็อก ตามวิธีนับเดิม','neutral','▦'],['ผ่านเกณฑ์',s.completed,`${s.percent}% ของตัวชี้วัดที่แสดง`,'teal','✓'],['กำลังดำเนินการ',s.in_progress,'กลับมาประเมินต่อได้','amber','◷'],['ยังไม่ประเมิน',s.none,'วางแผนดำเนินงานรายข้อ','blue','☷']];
 return `<section class="metrics" aria-label="สรุปผลประเมิน">${cards.map(([t,n,d,c,i])=>`<article class="metric"><span class="metric-icon ${c}">${i}</span><p>${t}</p><strong>${n}<small>ข้อ</small></strong><span>${d}</span></article>`).join('')}</section>
 <div class="overview-grid"><section class="card category-overview"><div class="section-heading"><div><p class="eyebrow">MOU PROGRESS</p><h2>ความคืบหน้ารายหมวด</h2></div>${badge('ข้อมูลตัวอย่าง','neutral')}</div><p class="muted">ผ่านเกณฑ์ / ตัวชี้วัดที่แสดงในหมวด</p><div class="category-bars">${categories.filter(c=>hospital().group!=='HOSPITAL'||c.id!=='6').map(c=>{const sum=summary(visibleItems(hospital().group).filter(i=>i.category===c.id),i=>record(i.id));return `<a class="category-bar" href="${base}/mou" data-category="${c.id}"><span class="category-number c${c.id}">0${c.id}</span><div><div class="bar-label"><strong>${c.title}</strong><span>${sum.completed}/${sum.total} ข้อ <b>${sum.percent}%</b></span></div>${progress(sum.percent,c.title)}</div><span aria-hidden="true">↗</span></a>`;}).join('')}</div></section>
 <section class="focus-card"><p class="eyebrow">NEXT ACTION</p><div class="focus-symbol">↗</div><h2>ก้าวต่อไปของ<br>หน่วยบริการคุณ</h2><p>กลับมาตรวจข้อเสนอแนะ และเพิ่มรายละเอียดให้พร้อมสำหรับการตรวจประเมิน</p><div class="focus-count"><strong>${s.rejected}</strong><span>ข้อที่มีตัวอย่าง<br>ข้อเสนอแนะให้แก้ไข</span></div>${link('mou','ดูข้อที่ต้องแก้ไข →','class="btn light" data-review="true"')}<small>ผลตรวจและข้อเสนอแนะในหน้านี้เป็นข้อมูลจำลอง</small></section></div>
 <section class="card"><div class="section-heading"><div><p class="eyebrow">SERVICE UNITS</p><h2>ติดตามหน่วยบริการ</h2></div><label class="search"><span>⌕</span><input id="unit-search" type="search" aria-label="ค้นหาหน่วยบริการ" placeholder="ค้นหาชื่อหรือประเภทหน่วยบริการ"></label></div><div class="table-scroll"><table><thead><tr><th>หน่วยบริการตัวอย่าง</th><th>ผ่านเกณฑ์</th><th>ยังไม่ประเมิน</th><th>ความคืบหน้า</th><th><span class="sr-only">เปิดประเมิน</span></th></tr></thead><tbody id="unit-rows">${unitRows()}</tbody></table></div><p id="unit-empty" class="empty" hidden>ไม่พบหน่วยบริการ ลองค้นหาด้วยคำอื่น</p></section>
 <p class="footnote">ชุดทดลองใช้หัวข้อตัวอย่างแบบย่อ ${items.length} ข้อ ยังไม่ใช่รายการตัวชี้วัดทั้งหมดจากระบบเดิม และไม่ใช่คะแนนรับรองมาตรฐาน</p>`;
}
function unitRows() {return hospitals.map(h=>{const s=totals(h.id);return `<tr data-unit-name="${esc(h.name+' '+h.type)}"><td><div class="unit-name"><span class="unit-avatar">${h.name.slice(-1)}</span><span><strong>${esc(h.name)}</strong><small>${esc(h.type)}</small></span></div></td><td>${s.completed}<span class="muted"> / ${s.total}</span></td><td>${s.none} ข้อ</td><td><div class="table-progress">${progress(s.percent,h.name)}<strong>${s.percent}%</strong></div></td><td><a class="row-link" href="${base}/mou" data-unit="${h.id}" aria-label="ประเมิน ${h.name}">ประเมิน <span>→</span></a></td></tr>`;}).join('');}
function assessment() {
 const s=totals();
 return `<section class="workflow" aria-label="ขั้นตอนประเมิน"><div><b>1</b><span>เลือกหน่วยบริการ / ปี</span></div><i>→</i><div><b>2</b><span>เลือกหมวดและข้อ</span></div><i>→</i><div><b>3</b><span>กรอกผลและหลักฐาน</span></div><i>→</i><div><b>4</b><span>บันทึก / ติดตามผลตรวจ</span></div></section>
 <div class="assessment-summary"><div><strong>${esc(hospital().name)}</strong><span>${esc(hospital().type)} · ปีงบประมาณ ${state.year}</span></div><div class="summary-progress">${progress(s.percent,'ผ่านเกณฑ์ทั้งหมด')}<strong>${s.percent}%</strong><span>ผ่าน ${s.completed} / ${s.total} ข้อ</span></div></div>
 <details class="demo-settings"><summary>ตั้งค่าเงื่อนไขรอบประเมินจำลอง</summary><div><label><input id="six-period" type="checkbox" ${state.settings.six?'checked':''}> เปิดรอบ 6 เดือน</label><label><input id="later-period" type="checkbox" ${state.settings.later?'checked':''}> เปิดรอบ 9 / 12 เดือน</label><p>จำลองสวิตช์เปิด–ปิดของระบบเดิม ไม่ใช่การเปลี่ยนสิทธิ์จริง ข้อที่ล็อกยังกดอ่านได้</p></div></details>
 <div class="category-tabs" role="tablist" aria-label="หมวดประเมิน">${categories.filter(c=>hospital().group!=='HOSPITAL'||c.id!=='6').map(c=>`<button role="tab" id="tab-${c.id}" aria-controls="assessment-panel" aria-selected="${state.category===c.id}" tabindex="${state.category===c.id?0:-1}" data-tab="${c.id}" class="category-tab ${state.category===c.id?'active':''}"><span class="category-number c${c.id}">0${c.id}</span><span>หมวดที่ ${c.id}<small>${c.title}</small></span></button>`).join('')}</div>
 <section id="assessment-panel" role="tabpanel" aria-labelledby="tab-${state.category}"><div class="category-heading"><div><p class="eyebrow">CATEGORY ${state.category.padStart(2,'0')}</p><h2>${categories.find(c=>c.id===state.category).title}</h2></div><label class="filter-label">แสดงข้อ<select id="status-filter"><option value="all" ${state.filter==='all'?'selected':''}>ทั้งหมด</option><option value="none" ${state.filter==='none'?'selected':''}>ยังไม่ประเมิน</option><option value="rejected" ${state.filter==='rejected'?'selected':''}>ต้องแก้ไข</option><option value="editable" ${state.filter==='editable'?'selected':''}>เปิดให้ประเมิน</option></select></label></div><div class="assessment-list">${assessmentRows()}</div></section><p class="footnote">หัวข้อตัวชี้วัดเป็นตัวอย่างแบบย่อเพื่อทดสอบ UX · แบบเดิมแนบหลักฐานด้วยลิงก์ ส่วนอัปโหลดไฟล์เข้า Drive จะพัฒนาในขั้นถัดไป</p>`;
}
function assessmentRows() {
 const list=visibleItems(hospital().group).filter(i=>i.category===state.category).filter(i=>state.filter==='all'||state.filter==='editable'&&!locked(i)||state.filter==='none'&&record(i.id).status==='none'||state.filter==='rejected'&&record(i.id).review==='rejected');
 if(!list.length)return `<div class="empty card"><strong>ไม่มีข้อประเมินตามตัวกรองนี้</strong><p>ลองเลือกหมวดอื่น หรือแสดงข้อประเมินทั้งหมด</p><button id="clear-filter" class="btn">แสดงทั้งหมด</button></div>`;
 return list.map(item=>{
 const r=record(item.id),reason=locked(item),edit=state.editing.has(item.id)||r.status==='none'&&!reason;
 return `<details class="assessment-item ${reason?'is-locked':''}" data-item="${item.id}" ${state.open.has(item.id)?'open':''}><summary><span class="item-number">${item.id}</span><span class="item-title"><strong>${esc(item.title)}</strong><span class="item-meta">${badge(periods[item.period],item.period==='6_months'?'neutral':'blue')}${reason?`<span class="lock-label">⊘ ${esc(reason)}</span>`:''}</span></span><span class="item-state">${badge(statuses[r.status],r.status==='completed'?'teal':r.status==='in_progress'?'amber':'neutral')}${r.status!=='none'?`<small class="review-${r.review}">${reviews[r.review]}</small>`:''}</span><span class="chevron" aria-hidden="true">⌄</span></summary><div class="item-body">
 ${reason?`<div class="lock-notice"><strong>เปิดอ่านได้ · ยังแก้ไขไม่ได้</strong><p>${esc(reason)}${reason==='ประเมินผ่านระบบ CTAM+'?' — หน้าประเมิน CTAM จะเชื่อมในขั้นถัดไป':''}</p></div>`:''}
 ${r.review==='rejected'&&r.status!=='none'?`<div class="review-note"><strong>ข้อเสนอแนะจากผู้ตรวจ (ตัวอย่าง)</strong><p>${esc(r.comment)}</p></div>`:''}
 ${edit?assessmentForm(item,r):`<dl class="saved-detail"><dt>รายละเอียดผลการดำเนินงาน</dt><dd>${r.detail?esc(r.detail):'ยังไม่มีข้อมูลตัวอย่าง'}</dd><dt>ลิงก์หลักฐาน</dt><dd>${r.link?`<a href="${esc(r.link)}" target="_blank" rel="noopener noreferrer">เปิดลิงก์หลักฐาน ↗</a><small>${esc(r.link)}</small>`:'ยังไม่มีหลักฐาน'}</dd></dl>${!reason?`<button class="btn" data-edit="${item.id}">แก้ไขผลประเมิน</button>`:''}`}
 </div></details>`;}).join('');
}
function assessmentForm(item,r) {
 r=drafts.get(item.id)||r;
 return `<form class="assessment-form" data-form="${item.id}" novalidate><fieldset><legend>สถานะการดำเนินงาน <span class="required">*</span></legend><div class="status-options">${['completed','in_progress','cannot_do'].map((s,n)=>`<label class="status-choice"><input type="radio" name="status" value="${s}" ${r.status===s?'checked':''} required><span><b>${['✓','◷','−'][n]}</b>${statuses[s]}</span></label>`).join('')}</div></fieldset><label class="field-label" for="detail-${item.id}">รายละเอียดการประเมิน <span class="required">*</span></label><textarea id="detail-${item.id}" name="detail" rows="4" maxlength="5000" required placeholder="สรุปสิ่งที่ดำเนินการ ช่วงเวลา และผลลัพธ์ (ใช้ข้อมูลสมมติเท่านั้น)">${esc(r.detail)}</textarea><label class="field-label" for="evidence-${item.id}">ลิงก์หลักฐาน <span class="required">*</span></label><input type="url" id="evidence-${item.id}" name="link" maxlength="2048" required value="${esc(r.link)}" placeholder="https://example.org/demo-evidence"><p class="field-help">กรอกลิงก์ตัวอย่าง ไม่ต้องแนบเอกสารจริง · ขั้นนี้ยังไม่อัปโหลดไฟล์</p><p class="form-error" id="error-${item.id}" role="alert"></p><div class="form-actions"><span>เก็บชั่วคราวในหน้านี้เท่านั้น</span><button type="button" class="btn" data-cancel="${item.id}">ยกเลิก</button><button type="submit" class="btn primary">จำลองบันทึกผล <span>✓</span></button></div></form>`;
}
function refresh(focusSelector) {
 shell(); if(focusSelector)document.querySelector(focusSelector)?.focus({preventScroll:true});
}
async function navigate(view,{unit,category,review,push=true}={}) {
 if(!await discardDrafts())return false;
 state.view=view;
 if(unit)state.hospital=unit;
 if(category)state.category=category;
 if(hospital().group==='HOSPITAL'&&state.category==='6')state.category='1';
 state.filter=review?'rejected':'all';state.open.clear();
 if(push)history.pushState({},'',`${base}/${view}`);
 refresh('#main');window.scrollTo({top:0,behavior:'instant'});return true;
}
function bind() {
 document.querySelector('#menu-toggle').onclick=e=>{const shown=root.classList.toggle('menu-open');e.currentTarget.setAttribute('aria-expanded',String(shown));e.currentTarget.setAttribute('aria-label',shown?'ปิดเมนู':'เปิดเมนู');};
 document.querySelector('#reset-demo').onclick=async()=>{if(await confirmAction('ล้างผลทดลองทั้งหมดและกลับไปชุดตัวอย่างเริ่มต้น? ข้อมูลจริงจะไม่ถูกเปลี่ยนแปลง')){state.records=seedRecords();state.dirty=false;drafts.clear();state.editing.clear();state.open.clear();refresh();notify('เริ่มชุดข้อมูลตัวอย่างใหม่แล้ว');}};
 document.querySelectorAll('[data-nav],[data-category],[data-unit]').forEach(a=>a.onclick=e=>{e.preventDefault();navigate(a.dataset.nav||'mou',{unit:a.dataset.unit,category:a.dataset.category,review:a.dataset.review==='true'});});
 document.querySelector('#hospital').onchange=async e=>{const value=e.target.value;if(!await discardDrafts()){e.target.value=state.hospital;return;}state.hospital=value;state.open.clear();if(hospital().group==='HOSPITAL'&&state.category==='6')state.category='1';refresh('#hospital');};
 document.querySelector('#year').onchange=async e=>{const value=Number(e.target.value);if(!await discardDrafts()){e.target.value=state.year;return;}state.year=value;state.open.clear();refresh('#year');};
 const search=document.querySelector('#unit-search');if(search)search.oninput=()=>{let count=0;document.querySelectorAll('[data-unit-name]').forEach(row=>{row.hidden=!row.dataset.unitName.toLowerCase().includes(search.value.trim().toLowerCase());if(!row.hidden)count++;});document.querySelector('#unit-empty').hidden=count>0;};
 document.querySelectorAll('[data-tab]').forEach(tab=>{
 tab.onclick=async()=>{if(!await discardDrafts())return;state.category=tab.dataset.tab;state.open.clear();refresh(`#tab-${state.category}`);};
 tab.onkeydown=e=>{const tabs=[...document.querySelectorAll('[data-tab]')],index=tabs.indexOf(tab);let next;if(e.key==='ArrowRight')next=(index+1)%tabs.length;if(e.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;if(next!==undefined){e.preventDefault();tabs[next].focus();tabs[next].click();}};
 });
 const filter=document.querySelector('#status-filter');if(filter)filter.onchange=async e=>{const value=e.target.value;if(!await discardDrafts()){e.target.value=state.filter;return;}state.filter=value;refresh('#status-filter');};
 const clear=document.querySelector('#clear-filter');if(clear)clear.onclick=()=>{state.filter='all';refresh('#status-filter');};
 for(const [selector,key] of [['#six-period','six'],['#later-period','later']]){const el=document.querySelector(selector);if(el)el.onchange=async()=>{const checked=el.checked;if(!await discardDrafts()){el.checked=state.settings[key];return;}state.settings[key]=checked;refresh();notify('เปลี่ยนเงื่อนไขจำลองแล้ว ไม่กระทบสิทธิ์จริง');};}
 document.querySelectorAll('[data-item]').forEach(el=>el.ontoggle=()=>{if(!el.isConnected)return;if(el.open)state.open.add(el.dataset.item);else state.open.delete(el.dataset.item);});
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=async()=>{if(!await discardDrafts())return;state.editing.add(b.dataset.edit);state.open.add(b.dataset.edit);refresh();document.getElementById(`detail-${b.dataset.edit}`)?.focus();});
 document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{if(!await discardDrafts())return;state.open.delete(b.dataset.cancel);refresh();notify('ยกเลิกการแก้ไขแล้ว');});
 document.querySelectorAll('[data-form]').forEach(form=>{
 form.oninput=()=>{state.dirty=true;const data=new FormData(form);drafts.set(form.dataset.form,{status:data.get('status'),detail:String(data.get('detail')||''),link:String(data.get('link')||'')});};
 form.onsubmit=e=>{
 e.preventDefault();const id=form.dataset.form,item=items.find(i=>i.id===id),reason=locked(item);
 const data=new FormData(form),value={status:data.get('status'),detail:String(data.get('detail')||'').trim(),link:String(data.get('link')||'').trim(),review:'pending',comment:''};
 const error=reason||validateAssessment(value),output=document.getElementById(`error-${id}`);
 if(error){output.textContent=error;form.querySelector(!value.status?'input[name="status"]':!value.detail?'textarea':'input[name="link"]').focus();return;}
 state.records[`${state.hospital}:${id}`]=value;state.editing.delete(id);drafts.delete(id);state.dirty=drafts.size>0;state.open.add(id);refresh();document.querySelector(`[data-item="${id}"] summary`)?.focus({preventScroll:true});notify('จำลองบันทึกแล้ว · รอตรวจสอบ · รีเฟรชหน้าจะล้างผลทดลอง');
 };
 });
}
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('popstate',async()=>{const view=location.pathname.endsWith('/mou')?'mou':'dashboard';if(!await navigate(view,{push:false}))history.pushState({},'',`${base}/${state.view}`);});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){root.classList.remove('menu-open');const b=document.querySelector('#menu-toggle');b?.setAttribute('aria-expanded','false');b?.setAttribute('aria-label','เปิดเมนู');}});
shell();
