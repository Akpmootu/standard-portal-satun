const logout=document.querySelector('form[action="/auth/logout"]');
if(logout)logout.addEventListener('submit',async event=>{
 event.preventDefault();const button=logout.querySelector('button');button.disabled=true;
 try{const response=await fetch('/auth/logout',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(logout))});if(!response.ok)throw Error();window.location.assign('/');}
 catch{button.disabled=false;button.textContent='ออกจากระบบไม่สำเร็จ · ลองอีกครั้ง';}
});
