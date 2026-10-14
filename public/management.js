for(const accountForm of document.querySelectorAll('[data-management]')){
 const role=accountForm.querySelector('[name="role"]');if(!role)continue;
 const sync=()=>{for(const name of ['hospitalId','hospitalIds','fiscalYears']){const control=accountForm.querySelector('[name="'+name+'"]');if(control)control.closest('label').hidden=name==='hospitalId'?role.value!=='hospital':role.value!=='reviewer';}};
 role.addEventListener('change',sync);sync();
}
for(const form of document.querySelectorAll('[data-management]')){
 let pending=false,uncertain=null;const message=form.querySelector('[role="status"]'),button=form.querySelector('button');
 const errors={VERSION_CONFLICT:'ข้อมูลเปลี่ยนแล้ว กรุณาเปิดข้อมูลล่าสุดก่อนบันทึก',ADMIN_REQUIRED:'บัญชีนี้ไม่มีสิทธิ์จัดการ',SELF_ADMIN_CHANGE_DENIED:'ไม่สามารถปิดหรือเปลี่ยนบทบาทบัญชีแอดมินที่กำลังใช้งาน',LAST_ADMIN_REQUIRED:'ต้องมีแอดมินที่เปิดใช้งานอย่างน้อยหนึ่งบัญชี',REVIEW_SCOPE_REQUIRED:'กรุณาระบุหน่วยบริการและปีงบประมาณของผู้ตรวจ',REVIEW_PROFILE_REQUIRED:'กรุณาระบุชื่อผู้ตรวจ',INVALID_MANAGEMENT_FIELD:'กรุณาตรวจข้อมูลให้ครบถ้วน',INVALID_MANAGEMENT_COMMAND:'รูปแบบข้อมูลไม่ถูกต้อง',INVALID_EVIDENCE_LINK:'ลิงก์ต้องขึ้นต้นด้วย https:// หรือ http://',INVALID_HOSPITAL_MAPPING:'กรุณาเลือกหน่วยบริการ',INVALID_CSRF:'เซสชันเปลี่ยนแล้ว กรุณาเปิดแบบฟอร์มใหม่',APPROVAL_REQUIRED:'กรุณารอแอดมินอนุมัติ',ACCOUNT_DISABLED:'บัญชีถูกปิดใช้งาน',SIGN_IN_REQUIRED:'กรุณาเข้าสู่ระบบอีกครั้ง',WRITER_BUSY:'มีรายการกำลังบันทึก กรุณาลองใหม่',WRITES_DISABLED:'บริการบันทึกปิดอยู่',COMMIT_UNCERTAIN:'ยังยืนยันผลไม่ได้ กรุณาติดต่อผู้ดูแล'};
 form.addEventListener('submit',async e=>{e.preventDefault();if(pending)return;const fd=new FormData(form),data=Object.fromEntries(fd);data.expectedVersion=Number(data.expectedVersion);
  if(data.action==='account'){data.hospitalIds=data.role==='reviewer'?fd.getAll('hospitalIds'):[];data.fiscalYears=data.role==='reviewer'?String(data.fiscalYears).split(',').map(v=>Number(v.trim())).filter(Boolean):[];if(data.role!=='hospital')data.hospitalId='';}
  if(data.action==='announcement')data.active=data.active==='true';if(data.action==='comment')data.needsHelp=data.needsHelp==='true';
  const payload=uncertain||JSON.stringify(data);pending=true;button.disabled=true;message.textContent='กำลังบันทึก…';
  try{const response=await fetch('/api/management',{method:'POST',headers:{'Content-Type':'application/json'},body:payload}),result=await response.json();if(!response.ok||result.ok!==true)throw Object.assign(new Error(),{code:result.error});message.textContent='บันทึกสำเร็จ กำลังเปิดข้อมูลล่าสุด';window.location.reload();}
  catch(error){if(errors[error.code])message.textContent=errors[error.code];else{uncertain=payload;message.textContent='ยังยืนยันผลไม่ได้ กดลองอีกครั้งเพื่อส่งคำขอเดิม';for(const input of form.querySelectorAll('input:not([type="hidden"]),select,textarea'))input.disabled=true;}}
  finally{pending=false;button.disabled=false;}
 });
}
