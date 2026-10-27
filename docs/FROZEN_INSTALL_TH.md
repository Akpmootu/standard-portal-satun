# ขั้นที่ 6 — dependency install ที่ทำซ้ำได้

เริ่มจาก 1720cd1 วันที่ 27 ตุลาคม 2569

ใช้ pnpm-lock.yaml เดิมเป็นแหล่งเดียว ไม่เปลี่ยนเวอร์ชัน application dependencies กำหนด packageManager pnpm@11.25.0 (รุ่นที่มีในเครื่องและตรวจ registry แล้ว) กับ Node24.x เปลี่ยน CI จาก npm install เป็น pnpm frozen/ignore-scripts และกำหนดคำสั่ง Vercel ให้ใช้ pnpm รุ่นเดียวกัน ตรวจ build logs ว่าใช้จริง ไม่อนุมานจาก deploy Ready อย่างเดียว

ตรวจรับด้วย clean install ในโฟลเดอร์แยก, hash lockfileก่อน/หลังตรงกัน, manifestไม่ตรงlockต้องติดตั้งล้มเหลว, tests/source/buildผ่านด้วยdependencyจากclean install และ CI/Vercelproductionlogsตรงรุ่น ไม่มีการเพิ่มsubscription/เปลี่ยนสิทธิ์/แก้ข้อมูลประเมิน

ใช้ Transitions.dev และ Transitions Polish ที่ติดตั้งอยู่แล้วควบคู่ ตรวจ motion เดิมเฉพาะส่วนที่เกี่ยวข้อง: error-page button 150ms/reduced-motion และ feedback ลงทะเบียน150ms/4px/blur2px/reduced-motion ขั้นนี้เป็นการแก้CI จึงไม่เพิ่มเอฟเฟกต์หรือแพ็กเกจfrontendที่ไม่จำเป็น และไม่อ้างสิทธิ์ Pro

เอกสารอ้างอิง: https://vercel.com/docs/package-managers (ตรวจ 27 ต.ค.2569) ระบุว่าใช้ packageManager เลือกรุ่นและ installCommand override ได้ ต้องตรวจผลจริงกับ legacy builds ของโครงการนี้

ขั้นต่อไปคือขั้นที่7 ตรวจความจุตารางและ retention ที่รักษาประวัติ/idempotency

## ผลตรวจในเครื่อง
- ติดตั้งจาก lockfile เดิมด้วย pnpm11.25.0 ในโฟลเดอร์แยกสำเร็จ 24 packages โดยไม่แก้ lockfile (เปรียบเทียบ hash ตรงกัน)
- เปลี่ยนเฉพาะ manifest ชุดจำลอง jose6.2.9 แต่ lockfile6.2.10 แล้ว frozen install ถูกปฏิเสธด้วย ERR_PNPM_OUTDATED_LOCKFILE exit1 ตามที่ต้องการ
- tests229รายการผ่านจาก source/dependencies ในโฟลเดอร์แยก (Node24.13.0) พร้อม source/config check และ Writer build
- การตรวจ Transitions เดิมพบ error button150ms, registration feedback150ms/4px/blur2px และ reduced-motion; ขั้นนี้ไม่มี UI diff หรือเพิ่ม motion dependency
- Node pin เป็น major24.x ไม่รับรอง patch/ระบบปฏิบัติการเหมือนกันทุกเครื่อง และ GitHub/Vercel build tooling ภายนอกยังอยู่นอก application lockfile
- ตรวจ diff ซ้ำโดยผู้เขียนเอง ไม่มี independent reviewer ในรอบนี้
