import {landingPage} from './landing-page.js';
import {portalShell} from './portal-layout.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function page({ loginConfigured, storageConfigured, identity, access, csrf, writeEnabled=false }) {
  const signedIn = Boolean(identity);
  const active = access?.status === 'active';
  if(active){
    const role=access.user.role,roles={admin:'ผู้ดูแลระบบ',reviewer:'ผู้ตรวจ MOU',hospital:'หน่วยบริการ'};
    const cards=[['/overview','ภาพรวมระบบ','สรุป MOU, CTAM และ HAIT ตามสิทธิ์ของคุณ'],['/dashboard','ภาพรวม MOU','ติดตามผลประเมินและเลือกหน่วยบริการ'],['/mou','ประเมิน MOU','บันทึกผลและหลักฐานตามรอบประเมิน'],...(role!=='reviewer'?[['/ctam','ประเมิน CTAM','ประเมินความมั่นคงปลอดภัยของโรงพยาบาล'],['/hait','ประเมิน HAIT','ติดตามผลตามหมวดและขอความช่วยเหลือ']]:[]),...(['admin','reviewer'].includes(role)?[['/mou/reviews','งานรอตรวจ MOU','พิจารณาผลหรือส่งกลับแก้ไขในขอบเขตที่ได้รับ']]:[]),['/reports','รายงานและส่งออก','ดูยอดสรุปและดาวน์โหลดรายงาน'],['/resources','คู่มือประเมิน','เปิดคู่มือที่ใช้ประกอบการประเมิน']];
    return portalShell('บัญชีและพื้นที่ทำงาน',`<section class="card"><p class="eyebrow">บัญชีที่ได้รับอนุมัติ</p><h2>${escape(identity.name||identity.email)}</h2><p>${escape(identity.email)} · ${escape(roles[role])}</p><p>เลือกงานที่ต้องการด้านล่าง หรือใช้เมนูหลักเพื่อสลับไปยังส่วนอื่นของระบบ</p><form method="post" action="/auth/logout"><input type="hidden" name="csrf" value="${escape(csrf)}"><button class="btn" type="submit">ออกจากระบบ</button></form></section><div class="portal-account-grid">${cards.map(([url,title,detail])=>`<a class="card" href="${url}"><h2>${title} →</h2><p>${detail}</p></a>`).join('')}</div>`,{role,path:'/',scripts:'<script src="/account.js" defer></script>'});
  }
    return landingPage({loginConfigured,storageConfigured,identity,access,csrf,writeEnabled});
}

