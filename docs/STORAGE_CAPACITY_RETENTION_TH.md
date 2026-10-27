# ขั้นที่ 7 — ความจุตารางและแนวทาง retention

วันที่ 27 ตุลาคม 2569 เริ่มจาก aa6de04

## ขอบเขต
เพิ่ม /admin/storage และ /api/admin/storage-capacity เฉพาะ active admin ไม่อ่านรายชื่อ/เบอร์/รายละเอียดผลประเมินเพื่อสร้างรายงาน ใช้ metadata หัวตาราง และคอลัมน์ key ของ 25 ตารางแบบ batch ไม่เกิน12 rangesต่อครั้ง แสดงจำนวน key, ตำแหน่งท้ายจากkey, ขนาดกริด, เพดานschema, พื้นที่ append เหลือไม่เกิน และสถานะเตือน75%/90%/เต็ม แยก missing/schema/keyinvalid และกริดเกินเพดาน ไม่แสดงfalse green

รายงานนี้ตรวจหัวตาราง/คอลัมน์รหัส ไม่ใช่รับรองความสมบูรณ์ทุกคอลัมน์ ตำแหน่งท้ายจากkeyเป็นเพียงขอบเขตล่างของการใช้งานจริง หากมีข้อมูลคอลัมน์อื่นต่อท้ายโดยไม่มีรหัส ต้องตรวจเต็มด้วย backup/restore ก่อนบำรุงรักษา กริดเกิน maxRows+1 ทำให้ระบบอ่าน/เขียนหยุดได้แม้มีรหัสน้อย จึงรายงานแยกอย่างชัดเจน

## Retention
ยังคง write_requests, audit_log, review histories, registration decision snapshots และความสัมพันธ์หลักฐานครบในระบบออนไลน์ ไม่มี purge/archive อัตโนมัติ ไม่มีTTLที่ทำให้ requestIdเก่ากลับมาใช้ได้ เมื่อ90%ต้องสำรองเข้ารหัส/ตรวจคืนข้อมูลและวางแผนแบ่งตารางภายใต้ช่วงหยุดเขียนก่อนทำจริง การย้ายwrite_requestsต้องมีarchive-aware lookup และทดสอบ replayจากข้อมูลเย็นก่อน จึงยังไม่เปิดย้าย/ลบในขั้นนี้

## ตรวจรับ
1. Testsให้failก่อน: thresholds/ช่องว่าง/oversizedgrid, keyprivacy, boundedbatch, authก่อนscan, missing/invalidไม่ใช่ศูนย์
2. เพิ่มbackendprojection, adminpage/navigation, JSONdownload และนโยบายretentionบนหน้าเดิมธีมemerald/cream
3. Browserชุดจำลอง admin/reviewer/refresh/download/รายละเอียดpolicyพร้อมkeyboardและreducedmotion; full tests/source/build
4. Deployและตรวจcapacityจริงแบบอ่านเท่านั้น ไม่มีการส่งTelegramหรือเปลี่ยนสิทธิ์เพื่อทดสอบ

Transitions ใช้ feedbackของปุ่มตามธีมและเปิดรายละเอียดpolicyแบบtext reveal150ms/4px/blur2px พร้อม reduced-motion ไม่เพิ่มmotiondependency

ขั้นต่อไปคือขั้นที่8 security events/การแจ้งเตือนโดยไม่เก็บความลับ

## ผลตรวจด้านโค้ดและ UI
- tests233รายการผ่าน รวมthreshold75/90/100, ช่องว่างก่อนรหัสท้าย, กริดเกินเพดาน, หัวตารางผิด/รหัสซ้ำ, ความเป็นส่วนตัว และauthก่อนscan/การปิดบัญชีมีผลทันที
- scan25ตารางใช้ metadata1ครั้งและkey/header batchไม่เกิน5ครั้ง (12rangesต่อbatch) ในfixture; metadataร่วมกับauthได้ในrequestเดียว
- กริดเกินเพดาน remainingUpperBound=0 และ UIไม่แสดงแถบพื้นที่เหลือที่ชวนให้เข้าใจว่ายังเพิ่มได้
- Codex Browserชุดจำลองดาวน์โหลดJSON ตรวจซ้ำ เปิดรายละเอียดด้วยEnter และปฏิเสธreviewerสำเร็จ; viewport320/390/768/1280ไม่มีhorizontaloverflow
- ใช้Transitionsรูปแบบreveal150ms/4px/blur2pxกับรายละเอียดpolicyและreduced-motion ไม่มีdependencyใหม่
- ตรวจdiffแยกอีกครั้งด้วยผู้เขียนเอง ไม่มีindependent reviewerในรอบนี้

## ข้อจำกัดในการเฝ้าระวัง
ตรวจเมื่อแอดมินเปิดหน้าหรือกดตรวจซ้ำ ไม่มีbackgroundpoll/cronหรือส่งTelegramเพิ่ม รายงานอ่านทีละbatchจึงไม่ใช่transactional snapshot ไม่ใช้แทนbackup/กระทบยอด ข้อมูลคอลัมน์อื่นที่ไม่มีkeyอาจทำให้ใช้แถวจริงมากกว่าที่อ่านจากkey ต้องตรวจเต็มระหว่างช่วงหยุดเขียนก่อนบำรุงรักษา หากตารางสิทธิ์เสียหรือเกินเพดานต้องfailclosedและให้เจ้าของตรวจนอกเว็บ ไม่ข้ามauthเพื่อเปิดรายงาน

เพดานschemaยังคงเดิม แยกจากข้อจำกัดเซลล์ของGoogleซึ่งอาจเปลี่ยนได้ อ้างอิงเอกสารผู้ให้บริการ https://support.google.com/drive/answer/37603?hl=en ไม่ใช้ขนาดกริดเป็นจำนวนrecordและไม่ขยายเพดานเอง
