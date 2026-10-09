# ขั้นที่ 3 — ประเภทหน่วยบริการและการตรวจฟอร์ม

วันที่ 4 กันยายน 2026: โค้ดและข้อมูลพร้อม ตรวจ live server ใหม่แล้วในขั้นถัดมา ควนโดนแสดงกลุ่มโรงพยาบาล 29 ข้อ และ 09625 แสดงกลุ่มปฐมภูมิ 38 ข้อ ดู MOU_PROGRESS_IMPORT_STEP4_TH.md ข้อความเรื่องรอ restart ด้านล่างเป็นประวัติ QA ก่อนหน้านี้

## สิ่งที่ทำแล้ว

- เพิ่ม `mou_agencies` ใน Application Data (sheetId 974606234) ช่วง A1:F75: header 1 แถว และประเภทหน่วยบริการ 74 แถว
- Fields: `id` เป็น hoscode ข้อความ 5 หลัก, `user_group`, `classification_source`, `status`, `_version`, `_request_id`
- 72 แห่งใช้ค่าที่มีค่าเดียวจาก reference snapshot SHA256 `ac8546f74c3456f7adc7f4501095c170f42370a81e019cf6dee0b5f2a737cd2e`
- ผู้ใช้ยืนยันในบทสนทนานี้ให้ 11402 โรงพยาบาลควนโดน และ 11404 โรงพยาบาลท่าแพ เป็น `โรงพยาบาล`; บันทึกแหล่งที่มาเป็น `owner_confirmed`
- จำนวนกลุ่ม: PHO 1 / DHO 7 / PCU 59 / HOSPITAL 7 ไม่มี pending
- อ่านกลับทุกเซลล์ตรงกับแผน คงเลขศูนย์นำหน้า และตรวจหน้าตา Google Sheets จริงแล้ว คงรูปแบบเรียบแบบชีตเดิม ไม่เปลี่ยนตารางผู้ใช้หรือ sharing
- `loadMouWorkspace` อ่านประเภทจากตารางใหม่นี้ ไม่ fallback จาก active users, กลุ่มบัญชีที่ล็อกอิน หรือชื่อ/ประเภทใน directory
- ตรวจสิทธิ์บัญชีและหน่วยบริการก่อนอ่าน reference เหมือนเดิม ตาราง mou_agencies ไม่สามารถอนุมัติหรือเพิ่มสิทธิ์บัญชีใดได้
- ประเภท pending/ขาดข้อมูลเป็น UNKNOWN; ID ซ้ำ/นอกโครงการ/สถานะผิด/ประเภทที่ confirmed แต่ไม่รู้จัก ปฏิเสธแทนการเดา

## กฎที่เทียบกับโค้ดเดิม

อ้างอิง local copy `work/hait-rg12-site/mou_assessment.php` บรรทัดประมาณ 121 เป็นต้นไป: โรงพยาบาลซ่อนหมวด 6 ส่วนกลุ่มอื่นยังมองเห็นทุกหมวด แต่ล็อกหมวด/ข้อที่ไม่ต้องประเมิน ไม่กรองทิ้งตาม target_group ทั้งหมด

- HOSPITAL: 5 หมวด / 29 ข้อ; 5.1–5.6 ชี้ไป CTAM+
- PHO/DHO/PCU: 6 หมวด / 38 ข้อ; DHO ล็อกนอกหมวด 1/3/5, PCU ล็อกหมวด 2; ข้อยกเว้น 3.1 และ 4.1/4.2 คงกฎเดิม
- ล็อกปีและค่ารอบเหมือนเดิม แอปยังอ่านอย่างเดียวแม้รอบเปิด ไม่มีการเปิด endpoint บันทึก

## หลักฐานการทดสอบ

- 63 automated tests ผ่าน พร้อม source/config checks
- ทดสอบ model กับ reference snapshot ครบ 74 แห่ง ได้หมวด/จำนวนข้อและกลุ่มตามข้างต้น; เป็นการทดสอบโค้ดกับ snapshot ไม่ใช่ live server เวอร์ชันใหม่
- Browser บนเซิร์ฟเวอร์เดิม: session หมดอายุแล้ว submit พากลับ login ตามปกติ ล็อกอินใหม่ด้วย Google บัญชี staging เดิมสำเร็จ
- หลังล็อกอิน เลือก 11402 แล้วกด “แสดงข้อมูล” และรอหน้าโหลดครบ ได้ `/dashboard?hospital_id=11402&year=2569` และชื่อโรงพยาบาลควนโดน ปุ่มไม่ได้เสีย ไม่ลด CSP หรือเพิ่ม JavaScript เพื่อแก้โดยไม่จำเป็น
- ยังไม่รับรอง live end-to-end ของ classification ใหม่จนกว่าเจ้าของ restart เซิร์ฟเวอร์

## เปิดโค้ดใหม่

ในหน้าต่าง PowerShell ที่รัน server อยู่ กด Ctrl+C หนึ่งครั้ง แล้วรัน:

```powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\Codex\2026-09-01\new-chat\work\standard-portal-google'
$portalNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $portalNode src/server.js
```

อย่าเปิด server ซ้ำอีกตัวโดยยังไม่หยุดตัวเดิม เพราะพอร์ต 3000 จะชนกัน ไม่ต้องสร้าง .env.local หรือขอ owner OAuth scopes ใหม่

รีเฟรช Dashboard แล้วตรวจควนโดน/ท่าแพแสดงกลุ่มโรงพยาบาลและ 29 ข้อ ส่วน 09625 เป็นกลุ่มปฐมภูมิ 38 ข้อ ข้อที่ล็อกยังขยายอ่านได้

ถ้าต้องการรายงานแบบอ่านอย่างเดียว เปิด PowerShell อีกหน้าต่างใน project แล้วรัน `scripts/verify-mou.js` ด้วย Node เดิม ควรได้ `units:74`, `pendingAgencyCount:0`, `agencyClassificationComplete:true` โดยไม่แสดง credentials

## งานถัดไป

หลังตรวจ live server ใหม่: วางแผนนำเข้าผลประเมิน MOU แบบตรวจสอบก่อนเขียน โดยตกลงปี/ขอบเขตและการจับคู่บัญชีผู้บันทึก/ผู้ตรวจ ห้ามถือว่าประเภทหน่วยบริการคือสิทธิ์บัญชี

ยังไม่ย้ายผลประเมินหรือไฟล์หลักฐาน ไม่เพิ่มสิทธิ์เขียน Google OAuth ไม่เปิด Billing ไม่ push GitHub/deploy Vercel และไม่เปลี่ยน production
