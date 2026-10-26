const confirmation=document.querySelector('#evidence-discard-confirm');let confirmationForm=null;
confirmation?.querySelector('[data-evidence-cancel]')?.addEventListener('click',()=>confirmation.close());
confirmation?.addEventListener('close',()=>{confirmationForm=null;});
confirmation?.querySelector('[data-evidence-confirm]')?.addEventListener('click',()=>{const form=confirmationForm;confirmationForm=null;confirmation.close();if(form){form.dataset.confirmed='true';form.requestSubmit();}});
for(const form of document.querySelectorAll('[data-evidence-manage]')){
 let busy=false,locked=null,waitingUntil=0;const button=form.querySelector('button'),status=form.querySelector('[role=status]');
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||Date.now()<waitingUntil)return;
  if(!locked&&form.dataset.action==='discard'&&form.dataset.confirmed!=='true'){if(confirmation instanceof HTMLDialogElement){confirmationForm=form;confirmation.showModal();}else status.textContent='ยังเปิดกล่องยืนยันไม่ได้ กรุณาโหลดหน้าใหม่';return;}
  const data=Object.fromEntries(new FormData(form));data.expectedVersion=Number(data.expectedVersion);locked??=JSON.stringify(data);busy=true;button.disabled=true;status.textContent='กำลังตรวจสอบ…';
  try{
   const response=await (window.PortalSession?.request||fetch)('/api/files/'+form.dataset.action,{method:'POST',headers:{'Content-Type':'application/json'},body:locked,signal:AbortSignal.timeout(65000)}),reply=await response.json();
   if(response.ok&&reply.ok){if(reply.pending){const wait=Number.isInteger(reply.retryAfter)?Math.max(1,Math.min(120,reply.retryAfter)):120;waitingUntil=Date.now()+wait*1000;status.textContent='พักไฟล์แล้ว รออีก '+wait+' วินาที จากนั้นกดดำเนินการต่อ';button.textContent='ดำเนินการย้ายต่อ';return;}status.textContent=form.dataset.action==='reconcile'?'ยืนยันว่าไม่พบไฟล์แล้วและปรับโควตาแล้ว':'ย้ายไปถังขยะแล้ว ยังนับพื้นที่จนยืนยันว่าไม่พบไฟล์';const link=document.createElement('a');link.href='/files';link.textContent='ดูรายการล่าสุด →';status.after(link);form.dataset.done='true';return;}
   const messages={SESSION_CHECK_FAILED:'ยังตรวจการเชื่อมต่อไม่ได้ กรุณาลองใหม่ ข้อมูลยังอยู่ในหน้านี้',FILE_IN_USE:'ไฟล์นี้มีรายการอ้างอิง จึงจัดการไม่ได้',FILE_ACCESS_DENIED:'คุณไม่มีสิทธิ์จัดการไฟล์นี้',VERSION_CONFLICT:'สถานะเปลี่ยนแล้ว กรุณาเปิดรายการล่าสุด',FILE_STILL_RETAINED:'บัญชีเจ้าของยังพบไฟล์อยู่ จึงยังคืนโควตาไม่ได้',FILE_STATE_CONFLICT:'สถานะไฟล์ไม่ตรง กรุณาเปิดรายการล่าสุด',SIGN_IN_REQUIRED:'กรุณาเข้าสู่ระบบด้วยบัญชีเดิมในแท็บใหม่ แล้วกลับมาตรวจการเชื่อมต่อ',INVALID_CSRF:'เซสชันเปลี่ยน กรุณาตรวจการเชื่อมต่อในแถบด้านบน ข้อมูลยังอยู่ในหน้านี้',EVIDENCE_DRIVE_UNAVAILABLE:'ยังตรวจ Drive ไม่ได้ ไฟล์ยังพักอยู่ ลองใหม่ได้',EVIDENCE_NOT_PRIVATE:'ข้อมูลสิทธิ์ไฟล์เปลี่ยน กรุณาให้ผู้ดูแลตรวจ',WRITES_DISABLED:'บริการบันทึกยังไม่เปิด'};
   status.textContent=messages[reply.error]||'ยังยืนยันผลไม่ได้ โปรดลองคำขอเดิมอีกครั้ง';
  }catch{status.textContent='ยังยืนยันผลไม่ได้ โปรดลองคำขอเดิมอีกครั้ง';}
  finally{busy=false;button.disabled=form.dataset.done==='true'||Date.now()<waitingUntil;if(Date.now()<waitingUntil)setTimeout(()=>{if(!busy&&form.dataset.done!=='true')button.disabled=false;},waitingUntil-Date.now());}
 });
}
