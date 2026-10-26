# ขั้นที่ 4: ส่งคำขอลงทะเบียนใหม่หลังไม่อนุมัติ

## ขอบเขตที่อนุญาตและแนวทาง
ผู้ใช้ให้ดำเนินการต่อจากขั้นที่ 3 ตามแผน 8 ประเด็น ใช้ Node/HTML/CSS เดิมและธีม emerald/cream ต่อไป ไม่สร้างบัญชีจริงหรือเปลี่ยนสิทธิ์เพื่อทดสอบ

คำขอเดิมแก้ได้เฉพาะ rejected และต้องเป็น Google subject เดิม ใช้ action resubmit พร้อม registrationId/expectedVersion ส่งกลับ pending และล้างผลตัดสินล่าสุด ไม่มีการเพิ่ม users/identities/profiles เก็บ snapshot ก่อน/หลังใน audit_log เดิมโดยไม่เปลี่ยน schema เก็บประวัติการพิจารณาที่ผู้สมัครเห็นเฉพาะตนเองและแอดมินเห็นได้ ห้ามใช้ส่งใหม่แทนการเปิดบัญชีที่ถูกปิด

## ลำดับดำเนินการ
1. เพิ่ม tests การปฏิเสธและส่งใหม่: ownership, stale version, status, injection, idempotency และไม่ให้สิทธิ์ รันให้เห็น fail ก่อนแก้
2. ปรับ shared registration rules, HTTP guard, หน้า form พร้อม prefill/locked email/phone10หลัก และ timeline เหตุผลเดิม; ใช้ micro feedback เฉพาะส่วนสถานะ ลด motion เมื่อร้องขอ
3. ตรวจ HTTP/GAS atomic batch และ browser ชุดจำลอง: rejected → แก้ → pending → admin approve; ทดสอบ concurrent/stale และป้องกันข้อมูลคนอื่น
4. ตรวจครบชุด source/config/build/diff, self-review แยกจาก implementation (ไม่ใช้ subagent ตามข้อกำหนด host), อัปเดต Writer deployment เดิมและเว็บ Vercel แล้วตรวจจริงแบบอ่านเท่านั้น

## เกณฑ์ตรวจรับ
- ต้องใช้บัญชีเดิม คำขอ rejected/versionตรงเท่านั้น
- pending/approved/บัญชีอื่นส่งใหม่ไม่ได้; admin ไม่สามารถอ้าง subject ผู้สมัครเองผ่าน API
- ข้อมูลเดิมและเหตุผลยังตรวจได้ แต่ไม่มีสิทธิ์ประเมินจนอนุมัติ
- requestId เดิม replay ไม่เพิ่มข้อมูล และการกดซ้ำไม่สร้างบัญชีซ้ำ
- email มาจาก verified Google session, unitอยู่จังหวัดสตูล, phone10หลัก
- browser ยืนยัน form/pending/history และ interaction; ไม่ส่ง Telegram หรือแก้ข้อมูลจริง

## Visual direction
ฟอร์มองค์กรสาธารณสุขโทน emerald/cream ใช้โครงเดิม แสดงเหตุผลเป็น notice สีทอง ตามด้วยฟอร์มที่เติมข้อมูลเดิมและประวัติแบบรายการตามเวลา ปุ่มหลัก “ส่งคำขอให้พิจารณาใหม่” หนึ่งจุด; focus/disabled/feedbackอ่านได้ด้วย keyboard และ touch ไม่เพิ่มภาพหรือ animation ที่รบกวน

## Ledger
- เริ่มจาก 0e5e7e4; ทำขั้นที่ 4 เท่านั้น ขั้นต่อไปคือ error pages ขั้นที่ 5

## ผลดำเนินการ
- Rules/UI/HTTP และ Writer bundle ผ่าน 220 tests, source/config check และ diff check
- Browser จำลอง: rejected → แก้ตำแหน่ง → resubmit pending → admin approve → approved; เปิดประวัติเดิมได้ ไม่มีการใช้บัญชีหรือข้อมูลจริงเพื่อทดสอบ
- ตรวจ diff แยกอีกรอบด้วยผู้เขียนเอง ไม่มี independent review ในรอบนี้; ownership/status/version/CSRF, idempotency, legacy history fallback และ no privilege escalation ครบตาม tests
- ใช้ audit_log schema เดิมเก็บ snapshot ก่อน/หลัง แสดงเฉพาะเจ้าของคำขอและแอดมิน ประวัติเก่าที่มีเพียง action ไม่สร้างรายละเอียดย้อนหลังที่ไม่มีหลักฐาน
- Motion เฉพาะ form feedback/history: 150ms, 4px, blur 2px, ease-in-out ตาม text-state reference พร้อม reduced motion; ไม่เพิ่มไลบรารี
- ไม่มีการทำขั้นที่ 5–8 ในรอบนี้
