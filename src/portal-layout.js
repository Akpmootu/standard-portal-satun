import {portalIcon} from './portal-icons.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function portalNavigation({path='/',role='hospital',hospitalId='',year=''}={}){
 const context=new URLSearchParams();if(hospitalId)context.set('hospital_id',hospitalId);if(year)context.set('year',String(year));
 const scoped=p=>p+(context.size?'?'+context:'');
 const groups=[['พื้นที่ทำงาน',[
  ['/overview','ภาพรวมระบบ','overview',year?'/overview?year='+encodeURIComponent(year):'/overview'],['/dashboard','ภาพรวม MOU','chart',scoped('/dashboard')],['/mou','ประเมิน MOU','assessment',scoped('/mou')],
  ...(role!=='reviewer'?[['/ctam','ประเมิน CTAM','shield'],['/hait','ประเมิน HAIT','hospital']]:[]),
  ...(['admin','reviewer'].includes(role)?[['/mou/reviews','งานรอตรวจ MOU','check',year?'/mou/reviews?year='+encodeURIComponent(year):'/mou/reviews'],['/mou/history','ประวัติการตรวจ','clock',scoped('/mou/history')]]:[]),
  ['/reports','รายงานและส่งออก','chart'],['/resources','คู่มือประเมิน','book'],['https://bdh-service.moph.go.th/smarthosp2569/','Smart Hospital ↗','external'],['/news','ประกาศ','news'],['/notifications','การแจ้งเตือน','bell']
 ]],...(role==='admin'?[['จัดการระบบ',[
  ['/admin/registrations','อนุมัติผู้ใช้งาน','users'],['/admin/users','จัดการผู้ใช้งาน','users'],['/admin/settings','รอบประเมิน MOU','clock'],['/admin/archive','ข้อมูลระบบเดิม','archive'],['/admin/integrations','การแจ้งเตือน / AI','settings']
 ]]]:[])];
 return groups.map(([label,links])=>`<p class="portal-nav-label">${label}</p>${links.map(([p,text,icon,url])=>{const selected=path===p||(p==='/mou'&&path==='/mou/action')||(p==='/ctam'&&path.startsWith('/ctam/'))||(p==='/hait'&&path.startsWith('/hait/'));return `<a class="portal-nav-link${selected?' selected':''}" href="${esc(url||p)}"${p.startsWith('https://')?' target="_blank" rel="noopener noreferrer"':''}${selected?' aria-current="page"':''}><span aria-hidden="true">${portalIcon(icon)}</span>${text}</a>`;}).join('')}`).join('');
}

export function portalStart(title,{path='/',role='hospital',hospitalId='',year='',scripts='',styles='',bodyClass='action-page',heading=true,guest=false}={}){
 const options={path,role,hospitalId,year},nav=guest?'<a class="portal-nav-link" href="/">เข้าสู่ระบบ / บัญชี</a>':portalNavigation(options);
 const brand='<a class="portal-brand" href="/overview"><span class="portal-mark" aria-hidden="true">S<span>+</span></span><span>STANDARD PORTAL<small>สุขภาพดิจิทัล · สตูล</small></span></a>';
 return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Standard Portal</title><link rel="stylesheet" href="/workspace.css"><link rel="stylesheet" href="/mou-action.css"><link rel="stylesheet" href="/modules.css">${styles}<link rel="stylesheet" href="/portal-layout.css"><link rel="stylesheet" href="/portal-refinement.css">${scripts}</head><body class="${esc(bodyClass)} portal-layout"><a class="portal-skip" href="#main">ข้ามไปเนื้อหา</a><aside class="portal-sidebar" aria-label="เมนูหลัก">${brand}<nav>${nav}</nav><a class="portal-account" href="/">บัญชีของฉัน →</a><p class="portal-sidebar-caption">สำนักงานสาธารณสุขจังหวัดสตูล</p></aside><div class="portal-page"><header class="portal-topbar"><span>พื้นที่ทำงาน / <strong>${esc(title)}</strong></span><a href="/">${esc(guest?'เข้าสู่ระบบ / บัญชี':({admin:'ผู้ดูแลระบบ',reviewer:'ผู้ตรวจ MOU',hospital:'หน่วยบริการ'})[role]||'บัญชีของฉัน')}</a></header><details class="portal-mobile-menu"><summary>☰ เมนูหลัก <span>STANDARD PORTAL</span></summary><nav>${nav}<a class="portal-nav-link" href="/">บัญชีของฉัน</a></nav></details><main id="main" class="portal-main">${heading?`<div class="portal-heading"><p class="eyebrow">SATUN DIGITAL HEALTH</p><h1>${esc(title)}</h1></div>`:''}`;
}
export const portalEnd=()=>'<footer class="portal-footer"><span>Standard Portal · สุขภาพดิจิทัลจังหวัดสตูล</span><a href="/privacy">การใช้ข้อมูลและติดต่อผู้ดูแล</a></footer></main></div></body></html>';
export function portalShell(title,body,options={}){if(typeof options==='boolean')options={role:options?'admin':'hospital'};return portalStart(title,{scripts:'<script src="/management.js" defer></script>',...options})+body+portalEnd();}


