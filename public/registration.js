for(const form of document.querySelectorAll('form[data-registration]')){
 let busy=false,lockedPayload=null;
 const role=form.querySelector('[name=role]');
 if(role){const sync=()=>{for(const group of form.querySelectorAll('[data-scope]'))group.hidden=group.dataset.scope!==role.value;};role.addEventListener('change',sync);sync();}

 const digits=[...form.querySelectorAll('[data-phone-digit]')],first=form.querySelector('[data-first-name]'),last=form.querySelector('[data-last-name]');
 const phoneNote=form.querySelector('[data-phone-note]');
 const numeric=value=>value.replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c))).replace(/\D/g,'');
 const syncProfile=()=>{if(first&&last){const name=(first.value.trim()+' '+last.value.trim()).trim();form.querySelector('[name=displayName]').value=name;last.setCustomValidity(name.length>100?'ชื่อและนามสกุลรวมกันต้องไม่เกิน 100 ตัวอักษร':'');}if(digits.length)form.querySelector('[name=phone]').value=digits.map(input=>input.value).join('');};
 first?.addEventListener('input',syncProfile);last?.addEventListener('input',syncProfile);
 const focusDigit=index=>{digits[index]?.focus();digits[index]?.select();};
 const distribute=(value,start)=>{const chars=numeric(value);if(chars.length>10||chars.length+start>10){phoneNote.textContent='กรุณาใส่เบอร์โทรศัพท์ 10 หลัก';return;}if(chars.length===10){start=0;for(const input of digits)input.value='';}for(let i=0;i<chars.length;i++)digits[start+i].value=chars[i];syncProfile();focusDigit(Math.min(9,start+chars.length));phoneNote.textContent='พิมพ์ทีละหลัก หรือวางเบอร์ 10 หลักได้ทันที ช่องนี้ไม่ใช่รหัส OTP';};
 digits.forEach((input,index)=>{input.addEventListener('focus',()=>input.select());input.addEventListener('click',()=>input.select());input.addEventListener('input',()=>{const value=numeric(input.value);if(value.length>1){distribute(value,value.length===10?0:index);return;}input.value=value;syncProfile();if(value&&index<9)focusDigit(index+1);});input.addEventListener('paste',event=>{event.preventDefault();const value=numeric(event.clipboardData?.getData('text')||'');distribute(value,value.length===10?0:index);});input.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'&&index>0){event.preventDefault();focusDigit(index-1);}if(event.key==='ArrowRight'&&index<9){event.preventDefault();focusDigit(index+1);}if(event.key==='Backspace'&&!input.value&&index>0){event.preventDefault();digits[index-1].value='';syncProfile();focusDigit(index-1);}});});
 const unit=form.querySelector('[data-registration-unit]'),count=form.querySelector('[data-registration-count]'),refresh=form.querySelector('[data-registration-refresh]');
 const showCount=()=>{const option=unit?.selectedOptions[0];if(count)count.textContent=unit.value?'หน่วยบริการนี้มีผู้ยื่นลงทะเบียนแล้ว '+Number(option.dataset.registrations||0).toLocaleString('th-TH')+' บัญชี (รวมทุกสถานะ)':'เลือกหน่วยบริการเพื่อดูจำนวนผู้ลงทะเบียน';};
 unit?.addEventListener('change',showCount);if(unit)showCount();syncProfile();
 refresh?.addEventListener('click',async()=>{refresh.disabled=true;const old=count.textContent;count.textContent='กำลังตรวจจำนวนล่าสุด…';try{const response=await fetch('/api/registration/units',{credentials:'same-origin',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(response.status===401?'SIGN_IN_REQUIRED':'UNAVAILABLE');const result=await response.json();if(!Array.isArray(result.units)||result.units.length>100||result.units.some(u=>!/^\d{5}$/.test(u.id)||typeof u.name!=='string'||!Number.isInteger(u.registrations)||u.registrations<0))throw Error('INVALID_DATA');const selected=unit.value;const blank=document.createElement('option');blank.value='';blank.textContent='เลือกหน่วยบริการ';unit.replaceChildren(blank);for(const u of result.units){const option=document.createElement('option');option.value=u.id;option.textContent=u.id+' · '+u.name;option.dataset.registrations=String(u.registrations);unit.append(option);}unit.value=selected;showCount();}catch(error){count.textContent=error.message==='SIGN_IN_REQUIRED'?'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่':'ยังตรวจจำนวนล่าสุดไม่ได้ กรุณาลองใหม่ · '+old;}finally{refresh.disabled=false;}});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  syncProfile();
  const fd=new FormData(form),data=Object.fromEntries(fd),output=form.querySelector('[data-registration-result]')||form.querySelector('[role="status"]'),button=form.querySelector('button[type="submit"]');
  if(data.action==='resubmit')data.expectedVersion=Number(data.expectedVersion);
  if(!['register','resubmit'].includes(data.action)){
   data.expectedVersion=Number(data.expectedVersion);
   data.hospitalIds=data.role==='reviewer'?fd.getAll('hospitalIds'):[];
   data.fiscalYears=data.role==='reviewer'?String(data.fiscalYears||'').split(',').map(s=>s.trim()).filter(Boolean).map(Number):[];
   if(data.role!=='hospital')data.hospitalId='';
  }
  const payload=lockedPayload||JSON.stringify(data);busy=true;button.disabled=true;output.textContent='กำลังบันทึก…';
  try{
   const response=await (window.PortalSession?.request||fetch)('/api/registration',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,credentials:'same-origin',signal:AbortSignal.timeout(65000)}),reply=await response.json();
   if(response.ok&&reply.ok){output.textContent=['register','resubmit'].includes(JSON.parse(payload).action)?'ส่งคำขอแล้ว รอแอดมินอนุมัติ':'บันทึกผลพิจารณาแล้ว';form.querySelector('fieldset').disabled=true;const link=document.createElement('a');link.className='form-result-link';link.href=['register','resubmit'].includes(data.action)?'/register':'/admin/registrations';link.textContent=['register','resubmit'].includes(data.action)?'ตรวจสถานะคำขอ →':'เปิดคำขอและผลพิจารณาล่าสุด →';output.after(link);return;}
   const code=typeof reply.error==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(reply.error)?reply.error:'UNKNOWN_ERROR';
   const errors={REGISTRATION_OWNER_REQUIRED:'คำขอนี้ไม่ได้เป็นของบัญชีที่เข้าสู่ระบบ',REGISTRATION_RESUBMIT_DENIED:'ส่งใหม่ได้เฉพาะคำขอที่ไม่อนุมัติ กรุณาตรวจสถานะล่าสุด',AMBIGUOUS_REGISTRATION:'พบคำขอซ้ำ กรุณาติดต่อผู้ดูแล',REGISTRATION_ALREADY_DECIDED:'คำขอนี้ถูกพิจารณาแล้ว กรุณาตรวจสถานะล่าสุด',SESSION_CHECK_FAILED:'ยังตรวจการเชื่อมต่อไม่ได้ กรุณาลองใหม่ ข้อมูลยังอยู่ในหน้านี้',REGISTRATION_FULL_NAME_REQUIRED:'กรุณาระบุชื่อและนามสกุลให้ครบ',REGISTRATION_PHONE_REQUIRED:'กรุณากรอกเบอร์โทรศัพท์เป็นตัวเลข 10 หลัก',REGISTRATION_UNIT_REQUIRED:'กรุณาเลือกหน่วยบริการจังหวัดสตูลจากรายการ',REGISTRATION_UNIT_UNAVAILABLE:'ยังไม่พบหน่วยบริการที่เลือก กรุณาตรวจรายการล่าสุด',INVALID_REGISTRATION:'กรุณาตรวจข้อมูลให้ครบและเบอร์โทรศัพท์ 10 หลัก',REGISTRATION_EXISTS:'บัญชีนี้มีคำขออยู่แล้ว กรุณาเปิดหน้าลงทะเบียนใหม่',REVIEW_SCOPE_REQUIRED:'กรุณาเลือกหน่วยบริการและปีสำหรับผู้ตรวจ',INVALID_HOSPITAL_MAPPING:'กรุณาเลือกหน่วยบริการ',REJECTION_NOTE_REQUIRED:'กรุณาระบุเหตุผลที่ไม่อนุมัติ',SIGN_IN_REQUIRED:'กรุณาเข้าสู่ระบบด้วยบัญชีเดิมในแท็บใหม่ แล้วกลับมาตรวจการเชื่อมต่อ',INVALID_CSRF:'เซสชันเปลี่ยน กรุณาตรวจการเชื่อมต่อในแถบด้านบน ข้อมูลยังอยู่ในหน้านี้',EXISTING_ACCOUNT_REVIEW_REQUIRED:'บัญชีเดิมมีสิทธิ์ต่างจากที่เลือก ต้องตรวจบัญชีเดิมก่อน',VERSION_CONFLICT:'คำขอนี้มีการเปลี่ยนแปลงแล้ว กรุณาอ่านข้อมูลล่าสุด'};
   output.textContent=(errors[code]||'ยังบันทึกไม่สำเร็จ')+' ('+code+')';
   if(['WRITE_RESULT_UNKNOWN','COMMIT_UNCERTAIN','WRITER_UNAVAILABLE'].includes(code))lockedPayload=payload;
  }catch{lockedPayload=payload;output.textContent='ยังยืนยันผลไม่ได้ กรุณาส่งคำขอเดิมซ้ำ';}
  finally{busy=false;if(lockedPayload){for(const el of form.querySelectorAll('input,select,textarea'))el.disabled=true;button.textContent='ตรวจผล / ส่งคำขอเดิมซ้ำ';}button.disabled=form.querySelector('fieldset').disabled;}
 });
}
