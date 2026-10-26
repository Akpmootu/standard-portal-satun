// Drafts stay in this document only. Recovery proves the original account;
// it never renews authentication, changes authorization, or retries writes.
(()=>{
 const context=document.querySelector('meta[name="portal-session"]');
 const selector='#mou-action,#module-action,[data-management],[data-registration],[data-evidence-manage],[data-integration]';
 if(!context||!document.querySelector(selector))return;
 const nativeFetch=window.fetch.bind(window),dirty=new Set(),revisions=new WeakMap(),attempts=new WeakMap();
 const writePaths=new Set(['/api/mou/write','/api/assessment/write','/api/registration','/api/management','/api/files/start','/api/files/chunk','/api/files/status','/api/files/finish','/api/files/discard','/api/files/reconcile','/api/integrations/ai','/api/integrations/telegram']);
 const savedPaths=new Set(['/api/mou/write','/api/assessment/write','/api/registration','/api/management','/api/files/discard','/api/files/reconcile']);
 let expiresAt=Number(context.dataset.expires),checking=null;
 const banner=document.createElement('section');banner.className='portal-session';banner.hidden=true;banner.setAttribute('aria-label','การเชื่อมต่อและร่างแบบฟอร์ม');
 banner.innerHTML='<div><strong data-session-title>การเชื่อมต่อของคุณ</strong><p role="status" aria-live="polite" data-session-message></p></div><div class="portal-session-actions"><a class="btn" href="/auth/google" target="_blank" rel="noopener noreferrer">เข้าสู่ระบบในแท็บใหม่ ↗</a><button class="btn" type="button" data-session-check>ตรวจการเชื่อมต่อ / กลับมาบันทึกต่อ</button></div>';
 (document.querySelector('main')||document.body).prepend(banner);
 const message=banner.querySelector('[data-session-message]'),title=banner.querySelector('[data-session-title]'),button=banner.querySelector('[data-session-check]');
 function show(kind,text){banner.hidden=false;banner.dataset.state=kind;title.textContent=kind==='ready'?'เชื่อมต่อบัญชีเดิมแล้ว':'เก็บร่างไว้ในแท็บนี้';message.textContent=text;}
 function warn(){if(banner.dataset.state==='blocked')return;const left=expiresAt-Date.now();if(left<=0)show('expired','เซสชันหมดอายุแล้ว เปิดเข้าสู่ระบบในแท็บใหม่ แล้วกลับมาตรวจการเชื่อมต่อ ข้อมูลที่กรอกยังอยู่ในหน้านี้');else if(left<=120000)show('warning','เซสชันจะหมดอายุในประมาณ '+Math.ceil(left/60000)+' นาที เปิดเข้าสู่ระบบในแท็บใหม่ได้ โดยยังไม่ต้องปิดฟอร์มนี้');}
 async function check(){
  if(checking)return checking;
  checking=(async()=>{
   button.disabled=true;
   try{
    const response=await nativeFetch('/api/session/recover',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({recoveryToken:context.content}),signal:AbortSignal.timeout(15000)}),reply=await response.json();
    if(!response.ok||reply.ok!==true){
     const text=reply.error==='RECOVERY_ACCOUNT_MISMATCH'?'บัญชีที่เข้าสู่ระบบไม่ใช่บัญชีเดิมของฟอร์มนี้ ยังไม่ส่งข้อมูล กรุณาเข้าสู่ระบบด้วยบัญชีเดิม':reply.error==='RECOVERY_CONTEXT_EXPIRED'?'หน้าเดิมเปิดนานเกินช่วงกู้ฟอร์มแล้ว กรุณาคัดลอกข้อความเก็บไว้ก่อนเปิดแบบฟอร์มใหม่':'ยังไม่มีเซสชันที่ใช้งานได้ เปิดเข้าสู่ระบบในแท็บใหม่ แล้วกลับมาตรวจการเชื่อมต่อ';
     show(['RECOVERY_ACCOUNT_MISMATCH','RECOVERY_CONTEXT_EXPIRED'].includes(reply.error)?'blocked':'expired',text);return {ok:false,code:'SIGN_IN_REQUIRED'};
    }
    if(typeof reply.csrf!=='string'||!reply.csrf||!Number.isFinite(reply.expiresAt))throw Error('INVALID_SESSION_RESPONSE');
    expiresAt=reply.expiresAt;for(const input of document.querySelectorAll('input[name="csrf"]'))input.value=reply.csrf;
    if(!banner.hidden)show('ready','ข้อมูลในฟอร์มยังอยู่ กดบันทึกได้ ระบบจะตรวจสิทธิ์และเวอร์ชันข้อมูลปัจจุบันอีกครั้ง');
    return {ok:true,csrf:reply.csrf};
   }catch{show('unavailable','ยังตรวจการเชื่อมต่อไม่ได้ ข้อมูลยังอยู่ในแท็บนี้ กรุณาลองตรวจอีกครั้ง');return {ok:false,code:'SESSION_CHECK_FAILED'};}
   finally{button.disabled=false;}
  })();
  try{return await checking;}finally{checking=null;}
 }
 function formFor(data){return [...document.querySelectorAll(selector)].find(form=>form.querySelector('[name="requestId"]')?.value===data.requestId);}
 function failure(code){return new Response(JSON.stringify({error:code}),{status:code==='SIGN_IN_REQUIRED'?401:503,headers:{'Content-Type':'application/json'}});}
 async function request(input,options={}){
  const url=new URL(input,location.href);
  if(url.origin!==location.origin||String(options.method||'GET').toUpperCase()!=='POST'||!writePaths.has(url.pathname))return nativeFetch(input,options);
  let data;try{data=JSON.parse(options.body);}catch{return nativeFetch(input,options);}
  const form=formFor(data),revision=form?(revisions.get(form)||0):0,session=await check();
  if(!session.ok)return failure(session.code);
  const {csrf:oldCsrf,...semantic}=data;data.csrf=session.csrf;
  let attempt;if(form&&savedPaths.has(url.pathname)){
   const key=JSON.stringify(semantic);attempt=attempts.get(form);
   if(!attempt||attempt.key!==key){attempt={key,revision};attempts.set(form,attempt);}
  }
  const response=await nativeFetch(input,{...options,body:JSON.stringify(data),credentials:'same-origin'});
  try{
   const reply=await response.clone().json();
   if(response.ok&&reply.ok===true&&!reply.pending&&attempt&&(revisions.get(form)||0)===attempt.revision)dirty.delete(form);
   if(reply.error==='SIGN_IN_REQUIRED'||reply.error==='INVALID_CSRF')show('expired','เซสชันเปลี่ยนระหว่างบันทึก กรุณาตรวจการเชื่อมต่อแล้วกดส่งคำขอเดิมอีกครั้ง ข้อมูลยังอยู่ในหน้านี้');
  }catch{/* The caller retains the original request when the commit outcome is unknown. */}
  return response;
 }
 for(const name of ['input','change'])document.addEventListener(name,event=>{const form=event.target.closest?.('form');if(form?.matches(selector)){dirty.add(form);revisions.set(form,(revisions.get(form)||0)+1);}},true);
 window.addEventListener('beforeunload',event=>{if(dirty.size){event.preventDefault();event.returnValue='';}});
 button.addEventListener('click',()=>check());
 window.addEventListener('focus',()=>{if(!banner.hidden)check();else warn();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(!banner.hidden)check();else warn();}});
 window.PortalSession={request,check};
 warn();setInterval(()=>{if(!document.hidden)warn();},15000);
})();
