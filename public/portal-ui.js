// Page-local controls: only act on content already returned within this user's scope.
const main=document.querySelector('.portal-main');
if(main){
 const toolbar=document.querySelector('[data-page-tools]');
 const listCards=location.pathname==='/admin/users'?'details.card':['/news','/notifications','/admin/registrations'].includes(location.pathname)?'section.card':null;
 const candidateGroups=['.read-unit,.module-unit','.assessment-item,.module-item','tbody tr',...(listCards?[listCards]:[])];
 const candidates=candidateGroups.map(selector=>[...main.querySelectorAll(selector)]).find(items=>items.length>0)||[];
 const input=toolbar?.querySelector('[data-page-search]'),clear=toolbar?.querySelector('[data-search-clear]'),count=toolbar?.querySelector('[data-search-count]');
 if(candidates.length&&input){
  toolbar.hidden=false;const searchGroup=toolbar.querySelector('[data-search-group]');searchGroup.hidden=false;
  const originalHidden=new Map(candidates.map(item=>[item,item.hidden]));
  const filter=()=>{const query=input.value.trim().toLocaleLowerCase('th-TH');let shown=0;
   for(const item of candidates){const match=!query||item.textContent.toLocaleLowerCase('th-TH').includes(query);item.hidden=originalHidden.get(item)||!match;if(!item.hidden)shown++;}
   count.textContent=query?`พบ ${shown} จาก ${candidates.length} รายการ`:'';clear.hidden=!query;
  };
  input.addEventListener('input',filter);clear.addEventListener('click',()=>{input.value='';filter();input.focus();});
 }
 const disclosures=[...main.querySelectorAll('details')];
 if(disclosures.length&&toolbar){toolbar.hidden=false;const expand=toolbar.querySelector('[data-expand-all]'),collapse=toolbar.querySelector('[data-collapse-all]');expand.hidden=false;collapse.hidden=false;
  expand.addEventListener('click',()=>{for(const detail of disclosures)if(!detail.hidden)detail.open=true;});
  collapse.addEventListener('click',()=>{for(const detail of disclosures)detail.open=false;});
 }
 if(location.pathname==='/reports'&&toolbar){toolbar.hidden=false;const print=toolbar.querySelector('[data-print-report]');print.hidden=false;print.addEventListener('click',()=>window.print());}
 // Make reasons for unavailable actions visible beside their existing permission gate.
 for(const fieldset of main.querySelectorAll('fieldset[disabled]')){
  if(fieldset.closest('form')?.querySelector('[data-disabled-note]'))continue;
  const note=document.createElement('p');note.dataset.disabledNote='';note.className='action-hint';note.textContent='ขณะนี้ยังบันทึกไม่ได้ โปรดตรวจสิทธิ์บัญชี รอบประเมิน หรือสถานะบริการตามข้อความในหน้านี้';fieldset.after(note);
 }
}
