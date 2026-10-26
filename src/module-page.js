import {portalShell} from './portal-layout.js';
import {randomUUID} from 'node:crypto';
import {fail} from './errors.js';
import {MODULES} from './module-rules.js';
import {normalizeAgencies} from './mou-agencies.js';
import {requireHospital} from './authorization.js';
import {STATUS_LABELS,REVIEW_LABELS} from './mou-read.js';
import {validWriteLink} from './mou-write-rules.js';
import {evidenceUpload,evidenceDownload} from './evidence-page.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const query=(unit,extra={})=>new URLSearchParams({hospital_id:unit,...extra});
export async function loadModule(store,access,module,hospitalId){
 fail(Object.hasOwn(MODULES,module),'UNKNOWN_MODULE',400);fail(access.status==='active','APPROVAL_REQUIRED',403);
 // Existing reviewer approvals are MOU-only. Do not silently expand their scopes.
 fail(access.user.role!=='reviewer','MODULE_SCOPE_REQUIRED',403);
 const def=MODULES[module],agencies=normalizeAgencies(await store.table('mou_agencies'));
 const allowed=[...agencies].filter(([id,a])=>a.group==='HOSPITAL'&&(access.user.role==='admin'||access.user.hospitalId===id)).map(([id])=>id);
 const units=await store.directory(allowed);hospitalId=hospitalId|| (access.user.role==='hospital'?access.user.hospitalId:'');
 const model={module,def,units,hospitalId,isAdmin:access.user.role==='admin',items:[],chapters:[],progress:[],history:[],unit:null};
 if(!hospitalId)return model;
 requireHospital(access,hospitalId,null,module);fail(allowed.includes(hospitalId),'HOSPITAL_ONLY',403);
 model.unit=units.find(u=>u.id===hospitalId);fail(model.unit,'HOSPITAL_NOT_FOUND',404);
 await store.prefetch?.([def.catalog,def.progress,def.history,...(module==='hait'?['rg12_chapters']:[])]);
 model.items=(await store.table(def.catalog)).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)||a.id.localeCompare(b.id,undefined,{numeric:true}));
 if(module==='hait')model.chapters=(await store.table('rg12_chapters')).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order));
 model.progress=(await store.table(def.progress)).filter(r=>r.hospital_id===hospitalId);
 const seen=new Set();for(const r of model.progress){fail(!seen.has(r[def.itemKey])&&model.items.some(i=>i.id===r[def.itemKey]),'INVALID_MODULE_PROGRESS');seen.add(r[def.itemKey]);fail(Object.hasOwn(STATUS_LABELS,r.status)&&Object.hasOwn(REVIEW_LABELS,r.admin_status),'INVALID_MODULE_PROGRESS');}
 const ids=new Set(model.progress.map(r=>r.id));model.history=(await store.table(def.history)).filter(r=>ids.has(r.progress_id));
 return model;
}
function shell(title,body,scripts='',m){return portalShell(title,body,{role:m?.isAdmin?'admin':'hospital',path:'/'+(m?.module||''),hospitalId:m?.hospitalId,scripts});}
export function modulePage(m,enabled){
 const title='ประเมิน '+m.def.title;
 if(!m.unit)return shell(title,`<section class="card"><h2>เลือกโรงพยาบาล</h2><div class="module-grid">${m.units.map(u=>`<a class="module-unit" href="/${m.module}?${query(u.id)}"><strong>${esc(u.name)}</strong><span>${esc(u.id)}</span></a>`).join('')}</div>${m.units.length?'':'<p>ไม่พบโรงพยาบาลในสิทธิ์ของคุณ</p>'}</section>`,'',m);
 const complete=m.progress.filter(r=>r.status==='completed').length,percent=m.items.length?Math.round(complete/m.items.length*100):0;
 function card(i){const r=m.progress.find(r=>r[m.def.itemKey]===i.id),history=m.history.filter(h=>h.progress_id===r?.id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 return `<details class="card module-item"><summary><strong>${esc(i.item_number||i.id)} · ${esc(i.title||i.item_text)}</strong><span>${esc(STATUS_LABELS[r?.status||'none'])} · ${esc(REVIEW_LABELS[r?.admin_status||'pending'])}</span></summary><div class="module-detail">${i.description?`<p>${esc(i.description)}</p>`:''}<dl><dt>ผู้รับผิดชอบ</dt><dd>${esc(r?.responsible_person||'ยังไม่ระบุ')}</dd><dt>รายละเอียด</dt><dd>${esc(r?.assessment_detail||'ยังไม่บันทึก')}</dd><dt>หลักฐาน</dt><dd>${evidenceDownload(r?.evidence_file)|| (validWriteLink(r?.evidence_link)?`<a href="${esc(r.evidence_link)}" target="_blank" rel="noopener noreferrer">เปิดลิงก์หลักฐาน ↗</a>`:'ยังไม่มีหลักฐาน')}</dd>${r?.admin_comment?`<dt>ข้อเสนอแนะผู้ตรวจ</dt><dd>${esc(r.admin_comment)}</dd>`:''}</dl>${enabled?`<div class="action-links"><a class="btn primary" href="/${m.module}/action?${query(m.hospitalId,{item_id:i.id,action:'save'})}">บันทึก${m.isAdmin?'การแก้ไข':'และส่งตรวจ'}</a>${m.isAdmin&&r?`<a class="btn" href="/${m.module}/action?${query(m.hospitalId,{item_id:i.id,action:'review'})}">ตรวจผล</a>`:''}</div>`:'<p>เปิดอ่านข้อมูลแล้ว บริการบันทึกของโมดูลนี้อยู่ระหว่างตรวจรับ</p>'}${history.length?`<h3>ประวัติการตรวจ</h3><ol>${history.map(h=>`<li><strong>${esc(REVIEW_LABELS[h.admin_status])}</strong> · ${esc(h.admin_reviewed_by)} · ${esc(h.created_at)}<p>${esc(h.admin_comment)}</p></li>`).join('')}</ol>`:''}</div></details>`;}
 const body=m.module==='hait'?m.chapters.map(c=>`<section><h2>หมวด ${esc(c.chapter_number)} · ${esc(c.title)}</h2>${m.items.filter(i=>i.chapter_id===c.id).map(card).join('')}</section>`).join(''):m.items.map(card).join('');
 return shell(title,`<section class="card"><h2>${esc(m.unit.name)}</h2><p>ผ่านเกณฑ์ที่หน่วยบริการรายงาน ${complete}/${m.items.length} ข้อ · ${percent}%</p><p>ตรวจอนุมัติ ${m.progress.filter(r=>r.admin_status==='approved').length} ข้อ · ต้องแก้ไข ${m.progress.filter(r=>r.admin_status==='rejected').length} ข้อ · บันทึกแล้วรอตรวจ ${m.progress.filter(r=>r.status!=='none'&&r.admin_status==='pending').length} ข้อ</p><progress value="${percent}" max="100" aria-label="ความคืบหน้า">${percent}%</progress><p>เลือกข้อ → บันทึกผลและหลักฐาน → ผู้ดูแลตรวจ → แก้ไขตามข้อเสนอแนะ</p><a href="/${m.module}">เปลี่ยนโรงพยาบาล</a> · <a href="/reports?module=${m.module}&hospital_id=${m.hospitalId}">รายงานหน่วยบริการ</a>${m.module==='hait'?` · <a href="/hait/comments?hospital_id=${m.hospitalId}">ความเห็น / ขอความช่วยเหลือ</a>`:''}</section>${body}`,'',m);
}
export function moduleActionPage(m,item,{csrf,action,enabled,reviewerName,evidenceEnabled=false}){
 const r=m.progress.find(r=>r[m.def.itemKey]===item.id),review=action==='review',back='/'+m.module+'?'+query(m.hospitalId);
 const version=r? r._version:0;fail(Number.isSafeInteger(version)&&version>=0,'INVALID_STORED_VERSION');
 const fields=review?`<label>ผลตรวจ<select name="reviewStatus" required><option value="">เลือกผลตรวจ</option><option value="approved">อนุมัติ</option><option value="rejected">ส่งกลับแก้ไข</option></select></label><label>ข้อเสนอแนะ<textarea name="comment" maxlength="10000" rows="5"></textarea></label><p>ผู้ตรวจ: ${esc(reviewerName)}</p>`:`<label>สถานะ<select name="status">${Object.entries(STATUS_LABELS).map(([k,v])=>`<option value="${k}" ${k===(r?.status||'none')?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label>ผู้รับผิดชอบ<input name="responsiblePerson" maxlength="300" value="${esc(r?.responsible_person)}"></label><label>รายละเอียด<textarea name="detail" maxlength="10000" rows="7">${esc(r?.assessment_detail)}</textarea></label><label>ลิงก์ PDF จาก Google Drive / ลิงก์หลักฐาน<input name="evidenceLink" type="url" maxlength="2048" value="${esc(validWriteLink(r?.evidence_link)?r.evidence_link:'')}"></label>${evidenceDownload(r?.evidence_file)}${evidenceUpload(evidenceEnabled)}<p>ให้บัญชีผู้ตรวจมีสิทธิ์เปิดลิงก์ Drive ไม่จำเป็นต้องเปิดเป็นสาธารณะ เว้นลิงก์ว่างเพื่อคงหลักฐานเดิม เมื่อบันทึกโดยหน่วยบริการจะกลับไปรอตรวจ</p>`;
 return shell((review?'ตรวจผล ':'บันทึกผล ')+m.def.title,`<a href="${esc(back)}">← กลับหน้าประเมิน</a><section class="card"><h2>${esc(item.title||item.item_text)}</h2><p>${esc(m.unit.name)}</p>${review?`<dl><dt>ผู้รับผิดชอบ</dt><dd>${esc(r?.responsible_person)}</dd><dt>รายละเอียด</dt><dd>${esc(r?.assessment_detail)}</dd><dt>หลักฐาน</dt><dd>${evidenceDownload(r?.evidence_file)|| (validWriteLink(r?.evidence_link)?`<a href="${esc(r.evidence_link)}" target="_blank" rel="noopener noreferrer">เปิดหลักฐาน</a>`:'ไม่ระบุ')}</dd></dl>`:''}<form id="module-action" data-return="${esc(back)}">${Object.entries({csrf,requestId:randomUUID(),module:m.module,action,hospitalId:m.hospitalId,itemId:item.id,expectedVersion:version}).map(([k,v])=>`<input type="hidden" name="${k}" value="${esc(v)}">`).join('')}<fieldset ${enabled?'':'disabled'}>${fields}<button type="submit" class="btn primary">${review?'ยืนยันผลตรวจ':'บันทึกผล'}</button></fieldset><p id="write-result" role="status" aria-live="polite"></p><a id="write-back" href="${esc(back)}" hidden>อ่านผลล่าสุด →</a></form></section>`,'<script src="/module-action.js" defer></script><script src="/evidence.js" defer></script>',m);
}
