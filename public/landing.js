// Native dialog provides keyboard focus handling and Escape-to-close.
const guide=document.querySelector('#getting-started');
document.querySelector('a[href="#getting-started"]')?.addEventListener('click',event=>{
 if(guide instanceof HTMLDialogElement){event.preventDefault();guide.showModal();}
});

if(location.hash==='#getting-started'&&guide instanceof HTMLDialogElement)guide.showModal();
