# ตรวจเหตุการณ์ความปลอดภัย

เพิ่มวันที่ 28 ตุลาคม 2569 โดยใช้ runtime logs เดิม ไม่มีบริการ/สิทธิ์ Google เพิ่ม และไม่เปลี่ยนกติกา Writer

## ข้อมูลที่บันทึก

- `portal_security_event`: timestamp UTC, requestId UUID สร้างโดย server, severity, หมวด route แบบคงที่, method, status, code จาก allowlist และ actor แบบ HMAC 24 ตัวอักษร
- `portal_security_alert`: category, code, ยอดเหตุการณ์ในหน้าต่าง, requestId และเวลาที่ใช้ค้นหาเหตุการณ์ ไม่รวม actor/เนื้อหาข้อมูล
- `portal_security_suppressed`: ยอด event ที่ลดการบันทึกเพื่อป้องกัน log flood

`X-Portal-Request-Id` ใน response ใช้แจ้งผู้ดูแลได้ ไม่รับค่าจาก header ของ client และไม่ใช่ requestId ธุรกรรม/idempotency ของ Writer ไม่ควรนำมาแทนกัน

ไม่บันทึก query/path ที่ผู้ใช้กำหนดเอง, IP, user agent, email, ชื่อ, เบอร์โทร, subject จริง, body, หลักฐาน, cookie, Authorization, CSRF, OAuth code, recovery token หรือ error/stack ต้นทาง actor ใช้ domain-separated HMAC ของ session key และ Google subject ผู้ไม่มีตัวตนเป็น anonymous; หมุน session key แล้ว actor เปลี่ยน ค่านี้ยังเป็นข้อมูลนามแฝงที่ควรจำกัดการเข้าถึง

เก็บเฉพาะการปฏิเสธ/ล้มเหลวที่เกี่ยวข้อง (รวม quota/บริการ), OAuth, login/logout สำเร็จ, อนุมัติสมัคร/เปลี่ยนบัญชีสำเร็จที่ไม่ใช่ replay ไม่บันทึกทุก successful read, 404/405 หรือ validation ปกติ ประวัติธุรกรรมฉบับเต็มยังอยู่ audit_log เดิม ซึ่งมีข้อมูลส่วนบุคคลและไม่ถูกคัดลอกมาใน runtime logs

## คำเตือนและขอบเขต

- category access/oauth/quota เตือนเมื่อถึง 5 ครั้งในหน้าต่างคงที่ 60 วินาทีต่อ category ต่อ process ไม่ใช่สรุปว่ามีผู้โจมตีแน่นอน
- service failure และ access_change เตือนครั้งแรก
- เตือน category เดิมได้อีกเมื่อครบ 300 วินาที; รายการ event ปกติไม่เกิน 60 ต่อหน้าต่าง 60 วินาที/process counters สำหรับ alert ยังนับต่อเมื่อ event ถูกลดจำนวน
- suppressed summary ออกเมื่อมีเหตุการณ์ถัดไปหลังหน้าต่างหมด หาก instance ถูกปิดก่อนจะไม่มี summary นั้น
- sink ล้มเหลวถูกตัดออก ไม่เปลี่ยนสิทธิ์ ผลบันทึก หรือส่งธุรกรรมซ้ำ ไม่รอ network ของ sink; default ใช้ console โดยตรง

คำเตือนนี้อยู่ใน Vercel runtime logs ผ่าน console.warn **ยังไม่ใช่การส่ง push/email/Telegram ไปถึงผู้ดูแล** ไม่มีการส่งข้อความ security เข้ากลุ่มเดิมอัตโนมัติ และไม่มีการเพิ่ม subscription ข้อมูลอาจแยกหลาย instance หรือหายเมื่อหมด retention ของโฮสต์ จึงไม่ใช่ระบบ SIEM หรือ distributed rate limit/WAF และไม่ป้องกันการโจมตีด้วยตัวมันเอง

## วิธีตรวจและตอบสนอง

1. ผู้ดูแลโครงการเปิด Vercel → Standard Portal → Logs เลือก production และช่วงเวลา ค้น `portal_security_alert` หรือ UUID จาก `X-Portal-Request-Id`; ใช้ CLI `vercel logs --project standard-portal-satun --environment production --since 1h --query portal_security --json` ได้ตามสิทธิ์เดิม
2. ตรวจ code/category/time และเทียบ Vercel request/access/firewall logs ตามสิทธิ์ หลีกเลี่ยงการส่งออก logs ทั้งก้อน เพราะโฮสต์อาจเก็บ URL หรือ metadata นอก schema ของแอปนี้
3. service/quota: ตรวจสถานะและโควตา Google/Writer รอ Retry-After ไม่ retry mutation อัตโนมัติ หาก WRITE_RESULT_UNKNOWN/COMMIT_UNCERTAIN ให้ตรวจ receipt ของ requestId ธุรกรรมเดิมก่อนกดส่งใหม่
4. access/oauth: ตรวจจำนวน/ช่วงเวลาและการตั้งค่า origin/login ตรวจ audit ของการเปลี่ยนบัญชีตามสิทธิ์ ก่อนตัดสินใจจำกัดหรือปิดบัญชี ห้ามอนุมานตัวบุคคลจาก anonymous หรือ HMAC เพียงอย่างเดียว
5. access_change: ยืนยันคำสั่งแอดมินกับ audit_log ตามเวลานั้น คำเตือนเป็นหลักฐานเฝ้าระวัง ไม่ใช่การอนุมัติสิทธิ์หรือการย้อนกลับอัตโนมัติ

## Retention และสิ่งที่ต้องตรวจรับแยก

ใช้ retention ของ Vercel plan ที่มีอยู่ ไม่มีการลบ logs หรือเปลี่ยน plan ในรอบนี้ ผู้ดูแลควรกำหนดผู้มีสิทธิ์อ่านให้น้อยที่สุด และเก็บสำเนาเฉพาะเหตุการณ์จำเป็นในที่ส่วนตัว โดยเสนอช่วงเก็บปกติไม่เกิน 30 วัน เว้นแต่มีเหตุ/นโยบายหน่วยงานให้เก็บต่อ การส่งสำเนาไปผู้รับหรือบริการใหม่ต้องระบุผู้รับและข้อมูลก่อน

ต้องยืนยันระยะ retention จริงและสิทธิ์ใช้ Vercel กับงานหน่วยงานตามเรื่องที่รอผู้ให้บริการอยู่ หากต้องการ notification ถึงเจ้าหน้าที่จริงและการนับรวมทุก instance ต้องเลือกช่องทาง/ผู้รับและวิธีเก็บ dedup ที่ทนต่อ restart ก่อนเปิด ไม่ถือว่าการมี warning logs ทดแทนการตรวจรับช่องทางนั้น

## หลักฐานโค้ด

ชุดทดสอบรวม 241 รายการผ่าน รวม 8 tests ใหม่: allowlist/canary, actor key rotation, thresholds/cooldown/log flood, sync/async sink ล้มเหลว, HTTP correlation, cross-unit deny, approval replay, OAuth/login/logout และ configuration gate ทดสอบด้วย fixture ไม่เปลี่ยนผลประเมินหรือ role บนระบบจริง

ตรวจทาน diff ด้วยตนเองในรอบแยก ไม่มี independent reviewer; ไม่ได้ตรวจ penetration test หรือรับรองว่าไม่มีช่องโหว่ทั้งหมด
