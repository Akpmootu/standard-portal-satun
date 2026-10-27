// A retry is always a deliberate GET navigation, never a write or an automatic request.
const retry=document.querySelector('[data-error-retry]');
if(retry){
 const seconds=Math.max(0,Math.min(120,Number(retry.dataset.retryAfter)||0)),until=Date.now()+seconds*1000,note=document.querySelector('[data-retry-note]');
 let timer;
 const update=()=>{const left=Math.max(0,Math.ceil((until-Date.now())/1000));retry.disabled=left>0;if(note)note.textContent=left?'กรุณารอประมาณ '+left+' วินาที ก่อนลองใหม่':'ลองเปิดหน้านี้ใหม่ได้แล้ว';if(!left&&timer)clearInterval(timer);};
 retry.addEventListener('click',()=>{if(Date.now()<until)return;retry.disabled=true;retry.textContent='กำลังลองเปิดใหม่…';location.reload();});
 update();if(seconds)timer=setInterval(update,1000);
}
