# ขั้นที่ 2 — เชื่อม Dashboard / MOU แบบอ่านจริง

ตรวจเมื่อ 4 กันยายน 2026

สถานะ: โค้ดอ่านข้อมูลและหน้าเว็บพร้อม พร้อมการทดสอบแบบจำลอง แต่ยังไม่ผ่านการตรวจครบวงจรกับแอปที่รันใน Terminal ของเจ้าของหลัง restart และยังไม่สามารถแสดงผลประเมินเดิมได้ เพราะข้อมูลในชีตยังไม่ถูกนำเข้า

## ผลตรวจ Google Sheets โดยตรง

ใช้ Google Drive / Google Sheets connector อ่าน metadata และขอบเขตแถวที่มีอยู่ทั้งหมดของตารางเป้าหมาย ไม่เขียนข้อมูลหรือเปลี่ยน sharing:

| แหล่งข้อมูล | ตาราง | ผลอ่าน |
| --- | --- | --- |
| Application Data | mou_categories | มีหัวตาราง ไม่มีแถวข้อมูล |
| Application Data | mou_items | มีหัวตาราง ไม่มีแถวข้อมูล |
| Application Data | mou_settings | มีหัวตาราง ไม่มีแถวข้อมูล |
| Application Data | mou_progress | มีหัวตาราง ไม่มีแถวข้อมูล |
| Hospital Reference | c_hosoffice | มีหัวตาราง ไม่มีแถวข้อมูล |

ตรวจแถว 1–100 ตามขนาด grid ที่ metadata แสดง ไม่ได้คาดเดาจากหน้าจอเก่า

- [Application Data](https://docs.google.com/spreadsheets/d/1dWXmgRRg1yP39OSxl2PmFarlH1xAi1gaKy-rJc4Ve7k/edit)
- [Hospital Reference](https://docs.google.com/spreadsheets/d/10UtjMGPnBKeMasgtrwYs3SPbqSu-f_RIhPU2tHYAaJw/edit)

## สิ่งที่เปลี่ยน

1. `/dashboard` และ `/mou` อ่านจาก Google Sheets ผ่าน server หลังตรวจ session และการอนุมัติบัญชี ไม่มีการโหลด `demo-model.js` หรือเติม fixtures เมื่อข้อมูลว่าง
2. `/demo/dashboard` และ `/demo/mou` ยังคงทดลอง UI เดิมได้ แยกชัดเจนและไม่ใช้ผลจำลองเป็นข้อมูลจริง
3. รองรับหมวด ตัวชี้วัด รอบประเมิน ชื่อหน่วยบริการ และผล MOU ตาม schema ที่อ่านจริง จับคู่ `mou_progress.item_id` กับ `mou_items.id` ไม่ใช้เลขแสดงผล เช่น `1.1` แทน primary key
4. ผู้ใช้หน่วยบริการอ่านได้เฉพาะหน่วยตนเอง ผู้ดูแลเลือกจากรายการโครงการที่หน้าเดิมระบุไว้ ไม่ส่งสารบบหน่วยบริการทั้งประเทศให้ browser
5. ชื่อและชนิดหน่วยบริการจาก reference; กลุ่มประเมินจาก `users.user_group` ที่ active ตามรูปแบบเดิม หากยังไม่ผูกหรือขัดแย้งกัน แสดงรอตรวจประเภท ไม่เดาเป็นโรงพยาบาล
6. กฎหมวด/ข้อ/ปี/รอบใช้แสดงเหตุผลล็อก ทั้งหมดยังอ่านอย่างเดียว การเปิดสวิตช์ในชีตไม่เปิด API บันทึกในขั้นนี้
7. ถ้าข้อมูลอ่านไม่ได้ แสดง error page สถานะ HTTP 503 ไม่แทนด้วย 0% หรือข้อมูลจำลอง ถ้าชีตว่างแสดงรอนำเข้าอย่างชัดเจน
8. แสดงผลและความเห็นผู้ตรวจแบบ escape HTML ลิงก์หลักฐานรับเฉพาะ HTTP(S) ที่ไม่มี credentials ใน URL ไม่มีการร้องขอเนื้อหาหลักฐานจาก server และไม่เปิดไฟล์เก่าจนกว่าจะย้าย/ตรวจสิทธิ์

## ขอบเขตการอ่านและการรักษาข้อมูล

- ไม่มี Google writes, import, upload, sharing, OAuth scope change, Billing, GitHub push หรือ Vercel deployment ในขั้นนี้
- ไม่แก้ไฟล์หรือฐานข้อมูล production
- อ่านตารางด้วย header contract และจำนวนแถวสูงสุด ไม่ยอมรับ schema ผิด/รหัสซ้ำ/ความสัมพันธ์ที่ขาดในผลที่เลือก
- สารบบ `c_hosoffice`: อ่านหัวตารางกับคอลัมน์รหัสก่อน แล้วอ่านเฉพาะแถวที่ตรงกับหน่วยบริการในสิทธิ์ ไม่ส่งที่อยู่ เลขใบอนุญาต หรือ user records ไปหน้าเว็บ
- ใช้ `GET values:batchGet` และ `spreadsheets.readonly` ที่มีอยู่ ตาม [Google Sheets API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet)
- หน้าอ่านจริงใช้ HTML ฝั่ง server และ GET forms ไม่มี JavaScript สำหรับดึงข้อมูล ไม่ cache สิทธิ์ และมี `Cache-Control: no-store`
- การทดสอบพร้อมกันหลายผู้ใช้/โควตา/การเปลี่ยนข้อมูลขณะอ่านยังต้องตรวจเพิ่มเติมก่อน production; Sheets ไม่ให้ transaction snapshot ข้ามตาราง

## เปิดโค้ดใหม่บนเครื่องของคุณ

1. ไป Terminal ปกติที่รันเซิร์ฟเวอร์พอร์ต 3000 กด `Ctrl+C` หยุดเฉพาะเซิร์ฟเวอร์นั้น
2. อยู่ในโฟลเดอร์ `C:\Users\user\Documents\Codex\2026-09-01\new-chat\work\standard-portal-google` แล้วรัน:

```powershell
& 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --env-file-if-exists=.env.local src/server.js
```

ข้อความ `.env.local not found. Continuing without it.` ไม่ได้หมายความว่าตั้งค่า Google หาย สคริปต์นี้อ่าน credentials ที่ตั้งไว้ใน `.secrets` ภายในเครื่องเอง หากมีข้อความ STARTUP_FAILED ให้ส่งเฉพาะข้อความ error ไม่ส่งไฟล์ secrets

3. เปิด http://127.0.0.1:3000/dashboard ล็อกอินใหม่ถ้า session หมดอายุ บัญชีต้องได้รับอนุมัติแล้ว จากหน้าแรกกด “เปิด Dashboard และอ่านผล MOU”
4. ผลที่คาดว่าจะเห็นในตอนนี้: รอนำเข้าหน่วยบริการและตัวชี้วัด ไม่ใช่ผลประเมินตัวอย่าง 17 ข้อ

ตรวจการอ่านผ่าน CLI เพิ่มได้ โดยไม่ต้องส่งผลรายบุคคล:

```powershell
& 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --env-file-if-exists=.env.local scripts/verify-mou.js
```

ควรรันใน Windows Terminal ปกติที่เข้าถึง `.secrets` ได้ ห้ามลด ACL หรือคัดลอก token ไปโฟลเดอร์สาธารณะเพื่อหลีกเลี่ยงปัญหาสิทธิ์

## ผลทดสอบ

- Node unit/HTTP tests 53 รายการผ่าน; source/config syntax checks ผ่าน
- ทดสอบปฏิเสธผู้ไม่ล็อกอิน/ยังไม่อนุมัติ/ข้ามหน่วยบริการ/พารามิเตอร์ซ้ำ/คำขอเขียน
- ทดสอบ ID มีศูนย์นำหน้า, primary key ต่างจากเลขข้อ, แยกปี, reference ว่าง, references ซ้ำ/ขาด, ข้อมูลอันตรายในชีต, Google failure และ reference lookup แบบขอบเขตจำกัด
- ตรวจ browser renderer ด้วย fixtures แยกจากแอปจริง: เปิดข้อที่ล็อก อ่านข้อเสนอแนะ กรองสถานะ เลือกปี สถานะไม่มีข้อมูล และเมนูมือถือ 390px ไม่มี horizontal overflow หรือ console errors ใน flow ที่ตรวจ
- ตัว renderer QA ไม่ใช่หลักฐานว่าแอปเชื่อม Google สำเร็จ การตรวจ Google สดในครั้งนี้ทำผ่าน connector เท่านั้น และไม่ได้อ่าน credentials ใน `.secrets`

## งานถัดไปที่ต้องทำจริง

**นำเข้าข้อมูลอ้างอิงจากระบบเดิมแบบตรวจสอบก่อนเขียน** ได้แก่ รายการหน่วยบริการเฉพาะโครงการ, หมวด MOU, ตัวชี้วัดฉบับเต็ม, การตั้งค่ารอบ และการผูกประเภท/บัญชี โดยเริ่มจาก export แบบระบุคอลัมน์และ dry-run ตรวจจำนวน/รหัส/ความสัมพันธ์ ตัดรหัสผ่าน token และข้อมูลที่ไม่เกี่ยวข้องออกทั้งหมด ไม่ย้ายผลประเมินหรือไฟล์หลักฐานในรอบนี้โดยอัตโนมัติ

ต้องสรุปความต่างของสิทธิ์ admin ระหว่างหน้าเดิมกับ save API ก่อนเปิด writes ตามประเด็นในคู่มือขั้นที่ 1 เมื่ออ้างอิงครบแล้วจึงทดลองย้ายผล MOU ชุดเล็กพร้อมตรวจจำนวนและสิทธิ์ จากนั้นพัฒนาการบันทึก/แนบไฟล์/ประวัติตรวจ และโมดูลที่เหลือ

GitHub private / Vercel preview ยังอยู่ขั้นหลังการตรวจ secrets และ hosting eligibility ไม่เปิดให้สาธารณะจากการตรวจครั้งนี้
