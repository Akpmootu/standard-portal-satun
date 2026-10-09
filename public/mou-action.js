const form=document.querySelector('#mou-action');
if(form){
  let pending=false,uncertainPayload=null;
  const result=document.querySelector('#write-result'),button=form.querySelector('button[type="submit"]');
  const messages={FILE_ACCESS_DENIED:'ไฟล์หลักฐานไม่ตรงกับรายการหรือสิทธิ์ของคุณ กรุณาเลือกไฟล์ใหม่',FILE_NOT_FOUND:'ไม่พบไฟล์หลักฐาน กรุณาอัปโหลดใหม่',REVIEW_PROFILE_REQUIRED:'บัญชีนี้ยังไม่มีข้อมูลผู้ตรวจที่ได้รับอนุมัติ',INVALID_REVIEW_PROFILE:'ข้อมูลผู้ตรวจไม่ถูกต้อง กรุณาให้ผู้ดูแลตรวจสอบ',REVIEW_SCOPE_DENIED:'รายการนี้อยู่นอกขอบเขตที่ได้รับมอบหมาย',REVIEWER_SAVE_DENIED:'บัญชีผู้ตรวจไม่มีสิทธิ์แก้ผลประเมินของหน่วยบริการ',VERSION_CONFLICT:'มีผู้อื่นแก้ไขข้อมูลนี้แล้ว กรุณาเปิดผลล่าสุดแล้วตรวจทานก่อนบันทึกใหม่ ข้อความที่คุณกรอกยังอยู่ในหน้านี้',REQUEST_ID_REUSED:'รหัสคำขอนี้เคยใช้กับข้อมูลอื่นแล้ว กรุณาเปิดแบบฟอร์มใหม่',ASSESSMENT_LOCKED:'ข้อนี้ปิดรับการแก้ไขตามรอบประเมินหรือประเภทหน่วยบริการ',ADMIN_REQUIRED:'ต้องใช้บัญชีผู้ดูแลเพื่อตรวจผล',EVIDENCE_REQUIRED:'กรุณาระบุลิงก์หลักฐานที่ถูกต้อง',ASSESSMENT_DETAIL_REQUIRED:'กรุณากรอกรายละเอียดผลการดำเนินงาน',INVALID_EVIDENCE_LINK:'ลิงก์ต้องเป็น HTTP หรือ HTTPS และไม่มีชื่อผู้ใช้หรือรหัสผ่านในลิงก์',REQUIRED_WRITE_FIELD:'กรุณากรอกชื่อผู้ตรวจและหมายเหตุเมื่อส่งกลับแก้ไข',WRITER_BUSY:'มีคำขออื่นกำลังบันทึก โปรดลองอีกครั้ง',WRITES_DISABLED:'บริการบันทึกยังไม่เปิดใช้งาน',COMMIT_UNCERTAIN:'ยังยืนยันผลบันทึกไม่ได้ ผู้ดูแลต้องตรวจรายการนี้ก่อนเปิดรับบันทึกต่อ',SIGN_IN_REQUIRED:'เซสชันหมดอายุ โปรดเข้าสู่ระบบในอีกแท็บ แล้วกลับมาลองอีกครั้ง',INVALID_CSRF:'เซสชันเปลี่ยนแล้ว โปรดเก็บข้อความที่กรอกไว้และเปิดแบบฟอร์มใหม่',WRITE_RESULT_UNKNOWN:'ยังยืนยันผลบันทึกไม่ได้ กดลองอีกครั้งเพื่อส่งคำขอเดิมซ้ำอย่างปลอดภัย'};
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(pending)return;
    const data=Object.fromEntries(new FormData(form));
    data.fiscalYear=Number(data.fiscalYear);data.expectedVersion=Number(data.expectedVersion);
    if(data.action==='review'&&data.reviewStatus==='rejected'&&!data.comment.trim()){result.textContent='กรุณาระบุข้อเสนอแนะที่ต้องแก้ไข';return;}
    const payload=uncertainPayload||JSON.stringify(data);
    pending=true;button.disabled=true;result.textContent='กำลังบันทึก กรุณารอผลยืนยัน…';
    try{
      const response=await fetch('/api/mou/write',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,credentials:'same-origin',signal:AbortSignal.timeout(65000)});
      const reply=await response.json();
      if(response.ok&&reply.ok===true){
        uncertainPayload=null;result.textContent=reply.replayed?'ยืนยันแล้ว: คำขอนี้บันทึกสำเร็จไว้ก่อนหน้า ไม่มีการบันทึกซ้ำ':'บันทึกสำเร็จแล้ว';form.querySelector('fieldset').disabled=true;document.querySelector('#write-back').hidden=false;return;
      }
      if(['WRITE_RESULT_UNKNOWN','COMMIT_UNCERTAIN','WRITER_UNAVAILABLE'].includes(reply.error))uncertainPayload=payload;
      const errorCode=typeof reply.error==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(reply.error)?reply.error:'UNKNOWN_ERROR';
      result.textContent=(messages[reply.error]||'บันทึกไม่สำเร็จ กรุณาตรวจการเชื่อมต่อหรือแจ้งผู้ดูแล ข้อมูลที่กรอกยังอยู่')+' ('+errorCode+')';
      if(uncertainPayload){button.textContent='ตรวจผล / ส่งคำขอเดิมซ้ำ';for(const el of form.querySelectorAll('input:not([type="hidden"]),textarea,select'))el.disabled=true;}
    }catch{uncertainPayload=payload;result.textContent=messages.WRITE_RESULT_UNKNOWN;button.textContent='ตรวจผล / ส่งคำขอเดิมซ้ำ';for(const el of form.querySelectorAll('input:not([type="hidden"]),textarea,select'))el.disabled=true;}
    finally{pending=false;button.disabled=form.querySelector('fieldset').disabled;}
  });
}
