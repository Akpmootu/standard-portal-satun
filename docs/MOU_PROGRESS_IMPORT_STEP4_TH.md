# ขั้นที่ 4 — นำเข้าผล MOU ปี 2569

วันที่ 4 กันยายน 2026: นำเข้าผลจริงเฉพาะปี 2569 ลง staging สำเร็จ 1,353 รายการ / 65 หน่วยบริการ อ่านกลับตรวจครบทุกเซลล์แล้ว ไม่ต้องรันนำเข้าซ้ำ

## ผลนำเข้ารอบนี้

- ปลายทาง: [Standard Portal - Application Data](https://docs.google.com/spreadsheets/d/1dWXmgRRg1yP39OSxl2PmFarlH1xAi1gaKy-rJc4Ve7k/edit) แท็บ `mou_progress!A2:Q1354`; เจ้าของ dh.satun@gmail.com และยังไม่แชร์
- SHA256 snapshot: `31f4119ea4d050744374d9f5c38e3a4f5e8aa36eab78b75c222e8c9c3582ac7e`
- SHA256 reference: `ac8546f74c3456f7adc7f4501095c170f42370a81e019cf6dee0b5f2a737cd2e`
- สถานะ: completed 1,344 / in_progress 8 / cannot_do 1 / none 0
- ผลตรวจล่าสุด: approved 1,150 / pending 197 / rejected 6
- ลิงก์หลักฐาน 1,314; ไม่พบ URL ผิดรูปแบบตามตัวตรวจของแอป แต่ไม่ได้เปิดลิงก์หรือยืนยันว่าไฟล์ยังเข้าถึงได้
- has_legacy_file เป็น false ทุกแถวใน snapshot นี้ จึงไม่มีไฟล์รอย้ายในชุดนี้ ไม่ได้แปลว่าทั้งระบบเดิมไม่มีไฟล์
- อีก 9 จาก 74 หน่วยบริการไม่มีแถวผลใน snapshot นี้ ไม่สร้างข้อมูลสมมติทดแทน
- ตรวจ header, ตารางปลายทางว่าง, catalog/settings และ directory ตรงกับ reference ก่อนเขียน; directory เรียงต่างกันแต่ข้อมูลตรงเมื่อจับคู่รหัส
- ขยายเฉพาะ grid ของ mou_progress เป็น 1,354 แถว คง 26 คอลัมน์และ frozen row/column; เขียน literal ชุดละไม่เกิน 50 แถว พร้อม checkpoint และ readback ทุกช่วง
- ตรวจ ID/ปี/รายการซ้ำ/สถานะ/จำนวนรวมอีกครั้งหลังเขียนครบ; คงเลขศูนย์นำหน้า และยอมรับเฉพาะลิงก์อัตโนมัติของ Sheets ที่ URI ตรงกับข้อความเซลล์
- อัปเดต `SCHEMA_INDEX!B8:D8` เป็น 1,353 / imported_fy2569 พร้อมขอบเขต; ไม่แก้ตารางบัญชีหรือประวัติ
- ตรวจ Google-rendered Sheet ที่แถวต้นและท้าย ปรับความสูงเฉพาะแถวข้อมูลให้ข้อความไม่ถูกตัด โดยคงความกว้างและธีมเดิม
- Receipt ส่วนตัว: `.migration/mou-import-2569-receipt.json`; ห้ามอัปโหลด snapshot หรือ receipt ขึ้น GitHub
- 70 tests และ source/config checks ผ่านหลังนำเข้าและเพิ่มตัวตรวจสาเหตุแบบไม่เผยข้อมูลลับ

นี่คือ snapshot ณ เวลาส่งออก ไม่ sync การแก้ไขใน PHP/MySQL ที่เกิดภายหลัง และไม่ใช่ backup ครบทั้งระบบ

## ผลทดสอบเว็บจริงและข้อจำกัดที่ยังเหลือ

- Google Login บัญชี staging admin ผ่าน; Dashboard ของ 09625 แสดงผ่าน 10/38 ข้อ (26%) ตรงกับ snapshot
- หลังนำเข้าครั้งแรก หน้า MOU ของ 09625 เคยแสดง read-error; ต่อมาเจ้าของรัน diagnostic ได้ ok:true / rendered:true ใน 7,139 ms, completed 10 / total 38 / percent 26
- ตรวจเว็บจริงซ้ำวันที่ 4 กันยายน 2026 เวลา 14:10 น. หลัง reload ผ่าน: หน้า MOU ของ 09625 ปี 2569 แสดง 10/38 ข้อ (26%), หมวด 1 แสดงผลตรวจสอบแล้วของข้อ 1.1 และ 1.2
- กดข้อ 1.1 ที่ปิดรับรอบ 6 เดือนแล้ว เปิดรายละเอียดได้ มี 3 หัวข้อข้อมูลและปุ่มลิงก์หลักฐาน โดยยังเป็นโหมดอ่านอย่างเดียว ไม่ได้เปิดลิงก์หรือแก้ข้อมูล
- ผลตรวจนี้ครอบคลุมตัวอย่าง 09625 ไม่ใช่การทดสอบทุกหน่วยบริการ/ปีหรือทดสอบโหลดพร้อมกัน และไม่ยืนยันว่าความล้มเหลวชั่วคราวจะไม่เกิดอีก
- ยังระบุไม่ได้ว่าเป็น quota/timeout/การเชื่อมต่อหรือข้อผิดพลาดอื่น ไม่แก้ข้อมูลหรือขยาย scopes จากการคาดเดา
- เพิ่ม `scripts/diagnose-mou-read.js` อ่านเฉพาะ workspace ของ 09625 ปี 2569 และคืน counts หรือรหัส error ที่อนุญาต ไม่พิมพ์ข้อความ upstream, credentials, ผลรายข้อ หรือ URL หลักฐาน ไม่เขียน Google

คำสั่งอ้างอิงสำหรับตรวจซ้ำเมื่อพบปัญหา (รอบล่าสุดผ่านแล้ว ไม่ต้องรันซ้ำตอนนี้) รันใน PowerShell ปกติอีกหน้าต่าง โดยไม่หยุด server:

```powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\Codex\2026-09-01\new-chat\work\standard-portal-google'
$portalNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $portalNode scripts/diagnose-mou-read.js
```

ส่งกลับเฉพาะผลสรุปของคำสั่ง ไม่ส่งไฟล์ .secrets หรือ .migration และไม่รันนำเข้าซ้ำ

## เว็บเวอร์ชันใหม่

ตรวจผ่าน browser บนพอร์ต 3000 แล้ว: dropdown + ปุ่มแสดงข้อมูลเปลี่ยนหน่วยบริการได้ ควนโดน 11402 เป็นโรงพยาบาลและมี 29 ข้อ; รพ.สต.ควนกาหลง 09625 เป็นกลุ่มปฐมภูมิและมี 38 ข้อ ไม่ขึ้นรอผูกประเภทแล้ว

`/demo/dashboard` เป็นข้อมูลสมมติ ให้ตรวจงานจริงที่ `/dashboard` และ `/mou` เท่านั้น

## ขอบเขตตัวช่วย

- ปี 2569 และ 74 รหัสโครงการเท่านั้น ไม่อ่านปีอื่นหรือบัญชีผู้ใช้
- ส่งออก mou_progress: สถานะ รายละเอียด ลิงก์หลักฐาน สถานะตรวจ/ข้อเสนอแนะล่าสุด และ attribution เดิม
- ไม่ส่งออก mou_review_history ในรอบแรก (ประวัติตรวจย้อนหลังแยกขั้น) ไม่อ่าน usernames/passwords/OAuth/สิทธิ์บัญชี
- ไม่ส่งออก path/ชื่อไฟล์หลักฐานหรือตัวไฟล์ ใช้ boolean has_legacy_file; แผนแปลงเป็น marker `legacy-file-pending` เพื่อไม่แสดงว่ามีไฟล์ใน Drive แล้ว
- รหัสผลประเมินในแผนเป็น `legacy-mou-<id>` ส่วนผู้บันทึก/ผู้ตรวจใช้ `legacy:<ค่าต้นทาง>` เป็น provenance เท่านั้น ไม่ผูกเป็นบัญชี Google หรืออนุมัติสิทธิ์
- raw snapshot คงค่าต้นทางที่อยู่ในขอบเขต ไม่แก้ผลตรวจเก่าและไม่ลดสถานะ approved เป็น pending เว้นต้นทางไม่มีสถานะ
- ไม่เปิดหรือดาวน์โหลดลิงก์หลักฐาน แผนรายงานจำนวนลิงก์ไม่ปลอดภัย แต่คงข้อความเป็น literal; หน้าอ่านมีตัวกรอง URL ของตนเอง

## ส่งออกใน PowerShell ปกติ

เปิด PowerShell อีกหน้าต่าง อย่าหยุด server ที่รันอยู่ แล้ววางชุดนี้:

```powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\Codex\2026-09-01\new-chat\work\standard-portal-google'
$portalNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$portalKey = Join-Path $env:USERPROFILE '.ssh\id_rsa'
& $portalNode scripts/export-mou-progress-local.js administrator $portalKey '.migration/mou-reference-2026-09-04T03-48-11-193Z.json'
```

ใช้ชื่อ `administrator` ไม่มี s ตัวช่วยส่ง PHP ผ่าน stdin ไป `php /dev/stdin` ไม่ติดตั้งบน production ทำ transaction READ ONLY และ rollback ใช้ strict host key และ BatchMode เดิม ไม่อ่าน key contents ใน JavaScript

ผลที่ควรส่งกลับ: JSON สรุป path, SHA256, referenceSha256, จำนวนผล/หน่วยบริการ/สถานะ/ลิงก์/ไฟล์รอย้าย ไม่ต้องแนบ JSON ข้อมูลจริงในแชต

ไฟล์ `.migration/mou-progress-2569-<timestamp>.json` เป็นข้อมูลการย้ายส่วนตัว อยู่ใน .gitignore ห้ามอัปโหลดขึ้น GitHub หรือแชร์สาธารณะ ไม่ใช่ backup ครบทั้งระบบ

## การตรวจและข้อจำกัด

- ก่อน SSH: ตรวจโครง reference JSON; หลัง SSH: ตรวจจำนวนตรง count ต้นทาง, ปี, รหัสในโครงการ, item ID อยู่ใน reference, ID และ hospital/item/year ไม่ซ้ำ
- ปฏิเสธคอลัมน์แปลกปลอม/enum ผิด/ชนิด ID ผิด และข้อความที่ยาวเกินขอบเขตหน้าอ่าน ไม่ตัดข้อความทิ้งเงียบ ๆ
- ไม่เกิน 5,000 แถวและ stdout buffer 32 MiB ถ้าเกินต้องแบ่งแผนใหม่ ห้ามเพิ่มเพดานโดยไม่ตรวจโควตา/เวลาตอบสนอง
- reference snapshot อาจเก่า หากพบ item ใหม่ ต้องส่งออก reference ใหม่และทบทวน ไม่ข้าม orphan check
- ตัวช่วยเก็บไฟล์เฉพาะเมื่อ validation ผ่าน ใช้ชื่อใหม่และ exclusive write ไม่ทับ snapshot เดิม
- การทดสอบ: 69 Node tests ผ่าน, source/config checks ผ่าน, PHP lint ผ่าน แต่ยังไม่ใช่หลักฐานส่งออกฐานข้อมูลจริงของปี 2569

## ลำดับตรวจนำเข้า (ดำเนินการในรอบนี้)

1. ตรวจ SHA256/สรุป/ปี/ความสัมพันธ์กับ reference สด และว่าขอบเขตตรงที่อนุมัติ
2. อ่าน metadata + CellData ของ mou_progress ใหม่ ตรวจ header และไม่มีข้อมูลเดิม สูตร/chips ที่จะถูกทับ; `requireEmptyMouTarget` จะปฏิเสธ target ที่มีผลอยู่แล้วแม้เพียงบางส่วน
3. คำนวณ grid ที่ต้องขยายและช่วงเขียนจริง จากนั้นเขียน literal values เป็นชุดที่จำกัดขนาด มี checkpoint และอ่านกลับแต่ละชุด ห้าม retry ทับชุดที่ตรวจแล้ว
4. ตรวจจำนวนสถานะ/คะแนน/หน่วยบริการ/ปีและสิทธิ์ในหน้าอ่านจริง; ไม่ถือว่าผลที่ยังไม่ย้ายคือไม่เคยประเมิน
5. จากนั้นจึงวางแผนประวัติตรวจย้อนหลัง ไฟล์ Drive และระบบบันทึก/ตรวจผล ไม่มีการเปิดการเขียนเว็บในรอบ import นี้

ในขั้นนี้ไม่เปลี่ยน production, Google scopes, Billing, GitHub หรือ Vercel

## ขั้นถัดไปก่อนใช้ระบบใหม่จริง

1. ตรวจรับผลปี 2569 เพิ่มเติมจากหน้า Dashboard/MOU เทียบระบบเดิม รวมกลุ่มโรงพยาบาล/ปฐมภูมิ/สสอ. และสถานะต้องแก้ไข; ลดคำขอ Google ที่ซ้ำและทดสอบความทนทานต่อ timeout/quota โดยไม่ cache สิทธิ์ข้ามคำขอ
2. วางแผนย้าย mou_review_history และตรวจลิงก์/ไฟล์หลักฐานในขอบเขตที่อนุมัติ รวมสิทธิ์เข้าถึง; ไม่เปิดลิงก์อัตโนมัติ
3. ทำระบบบันทึก/ส่งตรวจ/อนุมัติ พร้อมสิทธิ์หน่วยบริการ, CSRF, audit log, idempotency และการจัดคิวเขียนที่ไม่ทำข้อมูลชนกัน แล้วขอ owner OAuth scope เฉพาะเมื่อจำเป็น
4. ย้าย CTAM/HAIT และบัญชีอื่นตามแผนแยก ทดสอบข้อมูล/สิทธิ์/backup-restore/quota ก่อน cutover
5. ตรวจ secrets และข้อมูลส่วนตัวก่อนขึ้น GitHub แล้วตั้ง Vercel staging และ OAuth redirect URL; ประเมินข้อจำกัดแผนฟรีก่อนเปิดบริการ ไม่เปิด Billing โดยอัตโนมัติ
