# หน้าแรกตามภาพอ้างอิง — 14 ตุลาคม 2569

ปรับหน้าเข้าสู่ระบบและบัญชีที่ยังไม่ได้รับอนุมัติให้ตรงแนวทางภาพที่เจ้าของส่ง: โลโก้ ST ใบไม้ เมนูคู่มือ/ติดต่อผู้ดูแล ภาพพื้นหลังทะเลและเกาะ โทนขาว–เขียว แท็ก MOU/CTAM/HAIT/ลงทะเบียน การ์ดสถานะและ Google Login โลโก้และองค์ประกอบเป็น SVG/HTML ส่วนข้อความเป็นข้อความจริงในเว็บ

ภาพพื้นหลังสร้างด้วย built-in ImageGen จากภาพอ้างอิง เป็นภาพประกอบที่สร้างขึ้น ไม่ใช่ภาพถ่ายยืนยันสถานที่ เก็บใน public/satun-coast.webp ขนาด 76,286 ไบต์ โดยต้นฉบับภาพที่สร้างเก็บแยกไว้

คำสั่งสร้างภาพ: “Create ONLY the decorative background artwork from the supplied website reference. Remove all text, logos, UI panels, buttons and fields. Preserve tropical Andaman limestone islands and calm turquoise water on the far left lower half, forested hills and coastal village on the far right, pale misty white/mint center, translucent mint waves and soft blurred leaves at bottom corners. Central 70 percent predominantly white. No typography, logos, map or medical icons.” ใช้ built-in mode ไม่ใช้ API key หรือ CLI สร้างภาพ

ฟอนต์ Noto Sans Thai แบบ variable เก็บบนเว็บเอง (fontsource-variable-noto-sans-thai 5.3.0) มี license ใน public/SATUN_FONT_LICENSE.txt ไม่ใช้ CDN ฟอนต์หรือไอคอน หน้าแรกอนุญาตโหลดฟอนต์เฉพาะ self ใน CSP

สถานะ Google Login / Sheets/Drive / บันทึก MOU มาจาก configuration จริง ปุ่มเข้าสู่ระบบคง /auth/google การลงทะเบียนคงลำดับลงชื่อเข้าใช้ก่อนกรอกคำขอ บัญชีรออนุมัติ/ปิดใช้งานและการออกจากระบบพร้อม CSRF ยังรองรับเหมือนเดิม บัญชี active ใช้พื้นที่ทำงานเดิม

ปุ่มคู่มือเปิด native dialog อธิบายขั้นเริ่มใช้งานและปิดได้ด้วยปุ่มหรือ Escape ปุ่มติดต่อเป็น mailto:dh.satun@gmail.com เป็นลิงก์ให้ผู้ใช้กดเอง ไม่มีการส่งอีเมลโดยระบบในขั้นนี้

ตรวจเลย์เอาต์จริงที่ความกว้าง 320, 390, 768 และ 1024 พิกเซล ไม่พบล้นแนวนอน ตั้ง breakpoint คอลัมน์เดียวที่ 900 พิกเซล จอใหญ่เป็นสองคอลัมน์ ภาพตกแต่งไม่อยู่ในลำดับอ่านของเครื่องมือช่วยเข้าถึง

ชุดทดสอบ 179 รายการและ source check ผ่าน ตรวจ HTTP assets/Content-Type และ CSP fonts เพิ่มในชุดทดสอบเดิม ไม่มีการแก้ข้อมูลประเมินหรือบทบาทผู้ใช้
