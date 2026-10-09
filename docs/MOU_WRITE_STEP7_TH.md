# MOU: บันทึกและตรวจผล — ชุดเตรียมติดตั้ง 7 กันยายน 2569

สถานะ: โค้ดและการทดสอบในเครื่องพร้อม แต่ยังไม่ได้ติดตั้ง Apps Script หรือทดสอบการเขียน Google จริง เว็บหลักยังเป็น read-only

## สิ่งที่เพิ่ม
- หน่วยบริการบันทึกผลพร้อมรายละเอียดและลิงก์ แล้วกลับไปรอตรวจ โดยเก็บประวัติเดิม
- ผู้ดูแลแก้ผลโดยคงสถานะตรวจเดิม และอนุมัติหรือส่งกลับแก้ไขพร้อมชื่อผู้ตรวจ/เหตุผล
- ตรวจสิทธิ์จากชีตซ้ำในตัวรับคำขอ ตรวจรุ่นข้อมูลก่อนเขียน และเก็บ request receipt เพื่อไม่บันทึกซ้ำ
- ผลประเมิน ประวัติ (เมื่อมีการตรวจ) audit และ receipt เขียนด้วย batch เดียวภายใต้ ScriptLock
- หาก Google ตอบไม่ชัดเจนหลังส่ง batch ตัวรับปิดการเขียนและเก็บ MOU_UNCERTAIN_REQUEST_ID เพื่อให้ตรวจสอบก่อนเปิดใหม่

## ติดตั้งโดยบัญชีเจ้าของ dh.satun@gmail.com
1. เปิด https://script.google.com/home/start สร้างโครงการชื่อ Standard Portal MOU Writer
2. แทนเนื้อหา Code.gs ด้วย Writer.gs ในชุดนี้ เปิด Project Settings และเปิดการแสดง appsscript.json แล้วแทนด้วยไฟล์ manifest ในชุดนี้
3. ตรวจว่า Services มี Google Sheets API v4 ตาม manifest สิทธิ์ที่ร้องขอคือ spreadsheets ตัว writer จำกัดปลายทางไว้ที่ Application Data ID ด้านล่าง ไม่ขอ Drive scope และไม่เปลี่ยนสิทธิ์แชร์ชีต
4. ใน Script Properties ตั้ง MOU_SHEET_ID เป็น `1dWXmgRRg1yP39OSxl2PmFarlH1xAi1gaKy-rJc4Ve7k` และ MOU_WRITES_ENABLED เป็น `0`
5. Deploy > New deployment > Web app: Execute as บัญชีเจ้าของ และ Who has access: Anyone เพื่อให้เซิร์ฟเวอร์เรียกได้ คำขอจะต้องมีลายเซ็นลับจึงเข้าถึงข้อมูลได้ ชีตยังคงเป็นส่วนตัว ต้องให้เจ้าของตรวจและอนุญาตสิทธิ์ Google ด้วยตนเอง
6. คัดลอก Deployment URL ที่ลงท้าย /exec จากนั้นเปิด PowerShell ในโฟลเดอร์ standard-portal-google เดิมและรัน:

```powershell
& 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/setup-mou-writer.js
```

ป้อน URL เมื่อสคริปต์ถาม สคริปต์จะสร้าง `.secrets/mou-writer.json` โดยไม่พิมพ์กุญแจ และไม่เขียนทับไฟล์เดิม คัดลอกค่า secret จากไฟล์นี้ไปยัง Script Property ชื่อ MOU_WRITER_SECRET ผ่านเครื่องของเจ้าของ ห้ามส่ง secret ในแชตหรือ commit Git

## ก่อนเปิดการเขียนจริง
- คง gate เป็น 0 จนตรวจ deployment, properties, เจ้าของและ schema ครบ
- ต้องมี writer deployment เพียงชุดเดียวที่เขียนข้อมูลนี้ ห้ามแก้ตารางผล/ประวัติ/log โดยตรงระหว่างให้บริการ เพราะ ScriptLock ป้องกันเฉพาะคำขอภายในโครงการ Apps Script เดียวกัน
- การเปิดใช้งานต้องตั้ง MOU_WRITES_ENABLED=1 ทั้ง Script Properties และ environment ของ portal แล้ว restart portal โดยเจ้าของ การตั้งค่าฝั่งเดียวไม่เพียงพอ
- ยังต้องทดสอบคำขอจริงที่เจ้าของเลือก บัญชีหน่วยบริการและผู้ตรวจ รวมทั้งอ่านผล/ประวัติ/receipt กลับก่อนเปิดผู้ใช้ทั่วไป ห้ามใช้ข้อมูลผลประเมินจริงเป็นข้อมูลทดลองโดยไม่กำหนดรายการและผลที่ตั้งใจบันทึก
- การตั้งสวิตช์กลับ 0 ที่ Apps Script จะหยุดคำขอใหม่ รวมถึงกรณี portal ยังไม่ได้ restart

## เมื่อผลเขียนไม่แน่ชัด
อย่าสร้าง request ID ใหม่หรือกดส่งแบบฟอร์มใหม่ ตรวจ write_requests ด้วย MOU_UNCERTAIN_REQUEST_ID และตรวจผล/รุ่นข้อมูล ประวัติและ audit ที่เกี่ยวข้อง ถ้าพบ receipt committed ให้ตรวจว่าครบและถูกต้องก่อนเปิด gate กลับ ถ้าไม่พบ ยังห้ามถือว่าล้มเหลวทันที ต้องยืนยันว่าไม่มีคำขอค้างและไม่มี batch commit ตามมาภายหลัง หากยืนยันไม่ได้ให้คงการเขียนปิดไว้ เมื่อยืนยันสถานะได้แล้วจึงส่งคำขอเดิมซ้ำตามผลตรวจ

## ขอบเขตการตรวจ
ชุดทดสอบอัตโนมัติ 107 รายการผ่าน รวม shared rules, HTTP authorization/CSRF, signed transport และ bundled Apps Script กับ Sheets จำลอง หน้าเว็บจำลองทดสอบบันทึกแล้วกลับ pending และส่งกลับแก้ไขสำเร็จ ไม่ใช่การรับรอง deployment Google จริง ยังไม่ย้ายไฟล์แนบ CTAM/HAIT ปีอื่น หรือ deploy Vercel

อ้างอิง: [ScriptLock](https://developers.google.com/apps-script/reference/lock/lock-service), [Sheets batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate), [Web apps](https://developers.google.com/apps-script/guides/web), [ContentService redirects](https://developers.google.com/apps-script/guides/content)
