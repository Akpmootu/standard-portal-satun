# ขั้นที่ 5 — หน้าข้อผิดพลาดที่ใช้งานต่อได้

วันที่ 27 ตุลาคม 2569; เริ่มจาก c81f5aa

## แนวทางที่ใช้
คงธีม emerald/cream แบบเดิม ทำหน้า error ที่ไม่อาศัยข้อมูลสิทธิ์จาก Sheets เพื่อยังเปิดได้เมื่อบริการล่ม แสดงสาเหตุภาษาไทยและลิงก์กลับหน้าหลัก/บัญชี/สมัครตามกรณี ไม่แสดง URL/query, OAuth code, token, stack trace หรือข้อความจาก provider

API และคำขอ mutation คง JSON; GET/HEAD ที่ยอมรับ text/html และไม่ใช่ /api แสดง HTML ตาม HTTP status เดิม (เคารพ q=0) เส้นทาง MOU ที่มี HTML fallback อยู่แล้วคง HTML แต่ใช้ตัวแสดงร่วม คง Retry-After และไม่เปลี่ยน permission/CSRF

## ลำดับงาน
1. เขียน HTTP tests ให้ fail ก่อน: browser404/API404, permission403, invalid400, unavailable503/quota, OAuthไม่สำเร็จ และ Vercel release/config gate
2. เพิ่ม presenter/response helper และหน้าธีมร่วมที่ไม่เรียกข้อมูลภายนอก เชื่อม central catch/404/legacy HTML fallback และ Vercel wrapper
3. เพิ่มปุ่มลองใหม่เฉพาะหน้า GET ที่ปลอดภัย ไม่ใช่ auth ใช้คลิกเท่านั้นและรอ Retry-After ไม่ยิงซ้ำอัตโนมัติ รองรับ keyboard/touch/reduced motion
4. ตรวจ tests ทั้งชุด syntax/build/diff และ Codex Browser ทดสอบ404/403/503ด้วยข้อมูลจำลอง ก่อน deploy และตรวจproductionอ่านอย่างเดียว

## ตรวจรับ
ไม่มีข้อมูลผู้ใช้/ความลับใน error HTML, API คง contract, status/cache/security headers ถูกต้อง, ไม่แสดงผลประเมินศูนย์แทนข้อมูลล่ม, ไม่มีการเขียนผลจริงเพื่อทดสอบ ขั้นที่6จึงเริ่มหลังส่งมอบขั้นนี้

## ผลตรวจและข้อจำกัด
- Tests 229 ผ่าน รวม regression สไตล์ CRLF บน Windows ซึ่งต้อง normalize ก่อนคำนวณ CSP hash ไม่ใช้ unsafe-inline
- Source/config check และ build Writer ผ่าน ไม่มีการเปลี่ยน Apps Script ออนไลน์ในขั้นนี้
- Browser แยกข้อมูลจำลอง: 404 กลับหน้าหลักได้; 403 เปิดบัญชีได้; quota503 ปุ่มเริ่ม disabled รอครบแล้วกด Enter โหลดหน้าไฟล์ได้ ไม่เขียนข้อมูลหรือส่ง Telegram
- ตรวจ viewport จริง 320, 390, 768, 1280px ไม่พบ horizontal overflow; transition จำกัดสีปุ่ม 150ms และ press feedback 1px ไม่มีการเคลื่อนเนื้อหา error ที่รบกวน พร้อม reduced-motion
- ตรวจโค้ดซ้ำด้วยผู้เขียนเอง ไม่มี independent reviewer ในรอบนี้
- การตอบผิด Host/URL ก่อนผ่าน canonical check คง JSON; HEAD ยังคง 405 ตามกติกาเดิมและไม่มี body; เก็บ Allow/Retry-After เดิม
- HTTP error ที่เกิดก่อนเข้าแอป เช่น Vercel platform/network outage อยู่นอกขอบเขตตัวแสดงนี้ ไม่รับรองว่าสามารถแทนหน้า error ของผู้ให้บริการได้
- ขั้นที่ 6 ต่อไป: ใช้ dependency lockfile แบบ frozen ใน CI ให้ตรงชุดที่เผยแพร่
