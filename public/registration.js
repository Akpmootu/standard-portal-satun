for(const form of document.querySelectorAll('form[data-registration]')){
 let busy=false,lockedPayload=null;
 const role=form.querySelector('[name=role]');
 if(role){const sync=()=>{for(const group of form.querySelectorAll('[data-scope]'))group.hidden=group.dataset.scope!==role.value;};role.addEventListener('change',sync);sync();}
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const fd=new FormData(form),data=Object.fromEntries(fd),output=form.querySelector('[role="status"]'),button=form.querySelector('button[type="submit"]');
  if(data.action!=='register'){
   data.expectedVersion=Number(data.expectedVersion);
   data.hospitalIds=data.role==='reviewer'?fd.getAll('hospitalIds'):[];
   data.fiscalYears=data.role==='reviewer'?String(data.fiscalYears||'').split(',').map(s=>s.trim()).filter(Boolean).map(Number):[];
   if(data.role!=='hospital')data.hospitalId='';
  }
  const payload=lockedPayload||JSON.stringify(data);busy=true;button.disabled=true;output.textContent='กำลังบันทึก…';
  try{
   const response=await fetch('/api/registration',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,credentials:'same-origin',signal:AbortSignal.timeout(65000)}),reply=await response.json();
   if(response.ok&&reply.ok){output.textContent=JSON.parse(payload).action==='register'?'ส่งคำขอแล้ว รอแอดมินอนุมัติ':'บันทึกผลพิจารณาแล้ว';form.querySelector('fieldset').disabled=true;return;}
   const code=typeof reply.error==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(reply.error)?reply.error:'UNKNOWN_ERROR';
   const errors={REGISTRATION_EXISTS:'บัญชีนี้มีคำขออยู่แล้ว กรุณาเปิดหน้าลงทะเบียนใหม่',REVIEW_SCOPE_REQUIRED:'กรุณาเลือกหน่วยบริการและปีสำหรับผู้ตรวจ',INVALID_HOSPITAL_MAPPING:'กรุณาเลือกหน่วยบริการ',REJECTION_NOTE_REQUIRED:'กรุณาระบุเหตุผลที่ไม่อนุมัติ',SIGN_IN_REQUIRED:'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',INVALID_CSRF:'เซสชันเปลี่ยน กรุณาเปิดแบบฟอร์มใหม่',EXISTING_ACCOUNT_REVIEW_REQUIRED:'บัญชีเดิมมีสิทธิ์ต่างจากที่เลือก ต้องตรวจบัญชีเดิมก่อน',VERSION_CONFLICT:'คำขอนี้มีการเปลี่ยนแปลงแล้ว กรุณาอ่านข้อมูลล่าสุด'};
   output.textContent=(errors[code]||'ยังบันทึกไม่สำเร็จ')+' ('+code+')';
   if(['WRITE_RESULT_UNKNOWN','COMMIT_UNCERTAIN','WRITER_UNAVAILABLE'].includes(code))lockedPayload=payload;
  }catch{lockedPayload=payload;output.textContent='ยังยืนยันผลไม่ได้ กรุณาส่งคำขอเดิมซ้ำ';}
  finally{busy=false;if(lockedPayload){for(const el of form.querySelectorAll('input,select,textarea'))el.disabled=true;button.textContent='ตรวจผล / ส่งคำขอเดิมซ้ำ';}button.disabled=form.querySelector('fieldset').disabled;}
 });
}
