import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {portalBrandMark} from './portal-brand.js';
const style=readFileSync(new URL('../public/portal-error.css',import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const styleHash=createHash('sha256').update(style).digest('base64');
export const errorPageCsp="default-src 'none'; style-src 'sha256-"+styleHash+"'; script-src 'self'; font-src 'self'; img-src 'self'; connect-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";
export function acceptsErrorHtml(req,path){
 if(!['GET','HEAD'].includes(req.method)||path==='/api'||path?.startsWith('/api/'))return false;
 return String(req.headers.accept||'').split(',').some(part=>{const [type,...parameters]=part.trim().toLowerCase().split(';');if(!['text/html','application/xhtml+xml'].includes(type.trim()))return false;const q=parameters.find(p=>p.trim().startsWith('q='));return !q||Number(q.trim().slice(2))>0;});
}
export function errorPage({status,code,retryAfter=0,canRetry=false}){
 const oauth=['INVALID_OAUTH_STATE','GOOGLE_SIGN_IN_CANCELLED','GOOGLE_SIGN_IN_FAILED','INVALID_AUTHORIZATION_CODE'].includes(code),quota=code==='GOOGLE_QUOTA_EXCEEDED';
 let title='บริการยังไม่พร้อมใช้งาน',message='ยังเปิดข้อมูลหน้านี้ไม่ได้ในขณะนี้ กรุณารอสักครู่แล้วลองใหม่ หากยังพบปัญหาให้ติดต่อผู้ดูแลระบบ',secondary='/account',label='ตรวจบัญชีของฉัน';
 if(code==='WORKSPACE_UNAVAILABLE'){title='ยังอ่านข้อมูลจาก Sheets ไม่สำเร็จ';message='ยังแสดงผลประเมินล่าสุดไม่ได้ กรุณาลองใหม่ภายหลัง ระบบไม่ใช้ยอดศูนย์แทนข้อมูลที่อ่านไม่สำเร็จ';}
 if(status===404){title='ไม่พบหน้าที่ต้องการ';message='หน้าหรือไฟล์นี้อาจถูกย้าย หรือที่อยู่ไม่ถูกต้อง กลับหน้าหลักเพื่อเลือกเมนูที่ต้องการได้';}
 else if(status===401||oauth){title='กรุณาเข้าสู่ระบบอีกครั้ง';message='การยืนยันตัวตนยังไม่สำเร็จหรือเซสชันหมดอายุ กลับเข้าสู่ระบบด้วยบัญชี Google ของคุณ หากมีฟอร์มค้างในแท็บอื่น ให้เก็บแท็บนั้นไว้';secondary='/#login';label='เข้าสู่ระบบอีกครั้ง';}
 else if(status===403){title='ยังไม่มีสิทธิ์เปิดหน้านี้';message='บัญชีนี้ยังไม่ได้รับสิทธิ์สำหรับข้อมูลหรือการทำงานส่วนนี้ ตรวจสถานะบัญชีและหน่วยบริการที่ได้รับมอบหมาย หรือติดต่อผู้ดูแลระบบ';if(code==='APPROVAL_REQUIRED'){secondary='/register';label='ตรวจสถานะคำขอใช้งาน';}}
 else if(status>=400&&status<500){title='ไม่สามารถเปิดคำขอนี้ได้';message='รูปแบบคำขอหรือเงื่อนไขของข้อมูลไม่ถูกต้อง กรุณาเลือกเมนูใหม่จากหน้าหลัก หากกำลังแก้ฟอร์มในแท็บอื่น ให้เก็บข้อมูลไว้ก่อน';}
 if(quota){title='กำลังมีการเรียกใช้ข้อมูลจำนวนมาก';message='ระบบพักการอ่านข้อมูลชั่วคราวเพื่อรักษาโควตาบริการ กรุณารอตามเวลาที่แจ้งก่อนลองใหม่';}
 const wait=Number.isInteger(retryAfter)&&retryAfter>0?Math.min(120,retryAfter):0;
 return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} · Standard Portal</title><style>${style}</style>${canRetry?'<script src="/portal-error.js" defer></script>':''}</head><body><a class="skip" href="#main">ข้ามไปเนื้อหา</a><header><a class="brand" href="/">${portalBrandMark}<span>STANDARD PORTAL<small>Satun Digital Health</small></span></a><a class="help" href="mailto:dh.satun@gmail.com">ติดต่อผู้ดูแล</a></header><main id="main"><section class="error-card" aria-labelledby="error-title"><p class="eyebrow">SATUN DIGITAL HEALTH</p><span class="error-number">สถานะ ${status}</span><h1 id="error-title">${title}</h1><p class="description">${message}</p>${wait?`<p data-retry-note role="status" aria-live="polite">กรุณารอประมาณ ${wait} วินาที ก่อนลองใหม่</p>`:''}<div class="actions"><a class="btn primary" href="/">กลับหน้าหลัก</a><a class="btn" href="${secondary}">${label}</a>${canRetry?`<button class="btn" type="button" data-error-retry data-retry-after="${wait}" ${wait?'disabled':''}>ลองเปิดหน้านี้ใหม่</button>`:''}</div><div class="hint"><p>หากต้องการความช่วยเหลือ แจ้งผู้ดูแลว่าพบสถานะ ${status} และเมนูที่เปิด โดยไม่ส่งรหัสผ่านหรือรหัสยืนยัน</p></div></section></main><footer><span>สำนักงานสาธารณสุขจังหวัดสตูล</span><a href="/privacy">การใช้ข้อมูลและติดต่อผู้ดูแล</a></footer></body></html>`;
}
export function sendPortalError(req,res,{status=503,code='SERVICE_UNAVAILABLE',path='',forceHtml=false,allowHtml=true}={}){
 if(res.headersSent||res.writableEnded){if(!res.writableEnded)res.end();return;}
 status=Number.isInteger(status)&&status>=400&&status<=599?status:503;
 const html=allowHtml&&(forceHtml||acceptsErrorHtml(req,path));
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Accept');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('Content-Security-Policy',errorPageCsp);
 const canRetry=html&&req.method==='GET'&&status>=500&&path.startsWith('/')&&!path.startsWith('/auth/')&&!['PUBLIC_STAGING_DISABLED','CONFIGURATION_REQUIRED','LOGIN_NOT_CONFIGURED','STORAGE_NOT_CONFIGURED'].includes(code);
 res.writeHead(status,{'Content-Type':html?'text/html; charset=utf-8':'application/json; charset=utf-8'});
 return res.end(html?errorPage({status,code,retryAfter:Number(res.getHeader('Retry-After')),canRetry}):JSON.stringify({error:code}));
}
