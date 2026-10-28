# ขั้นที่ 8 — Security events (28 ตุลาคม 2569)

ใช้ structured JSON ใน runtime logs เดิมของ Vercel ไม่เพิ่มฐานข้อมูล บริการเสียเงิน หรือสิทธิ์ Google และไม่เขียนเหตุการณ์ปฏิเสธลง Sheets ที่กำลังมีปัญหา

1. สร้างตัวบันทึกแบบ allowlist: เวลา UTC, UUID ที่ server สร้าง, หมวด route คงที่, method/status, code คงที่ และ actor แบบ HMAC แยกโดเมนจาก session key (ไม่เก็บ subject/email จริง)
2. เชื่อมจุดตอบ error, JSON failure, OAuth, logout และการอนุมัติ/เปลี่ยนบัญชีสำเร็จ ใช้ audit_log เดิมสืบรายละเอียดธุรกรรมตามสิทธิ์ ห้ามใส่ command หรือ error object ใน logs
3. สร้าง portal_security_alert ระดับ warn ใน runtime logs เมื่อการปฏิเสธหมวดเดียวกันถึง 5 ครั้ง/60 วินาที, บริการล้มเหลวครั้งแรก หรือมีการเปลี่ยนสิทธิ์สำเร็จ จำกัดการเตือนหมวดละ 5 นาที และ events ไม่เกิน 60/นาที/process พร้อมยอด suppressed ในหน้าต่างถัดไป
4. ทดสอบ red→green: canary ความลับ, scope/CSRF/OAuth, threshold/cooldown/reset, sink ล้มเหลวไม่เปลี่ยนผลหรือ retry ธุรกรรม และ requestId ไม่เชื่อ header จาก client
5. ทดสอบทั้งชุด ตรวจ diff เผยแพร่และอ่าน production logs โดยไม่สร้างธุรกรรมหรือส่ง Telegram ซ้ำ

ขอบเขต: alert เป็นสัญญาณใน Vercel runtime logs ไม่ใช่การรับรองว่ามีเจ้าหน้าที่รับ push/email แล้ว การรวมหลาย instance/การเก็บ logs ระยะยาวและ firewall/access logs เป็นความสามารถของโฮสต์ ต้องตรวจ plan/retention จริงก่อนอ้างว่าครบ การจำกัดนี้ลดปริมาณ logs ไม่ใช่ WAF/rate limit ที่ป้องกันคำขอ และไม่มี actor tracking เมื่อไม่มี session key

ใช้แนวทางเดิมตามคำสั่งให้ดำเนินต่อ ตรวจโดยผู้เขียนเอง ไม่มอบหมาย subagent และไม่เพิ่ม UI ในขั้นนี้
