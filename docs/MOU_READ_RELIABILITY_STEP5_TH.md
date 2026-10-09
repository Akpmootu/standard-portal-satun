# ขั้นที่ 5 — ลดคำขออ่าน Google และตรวจผลต่างประเภทหน่วยบริการ

วันที่ 4 กันยายน 2026 — เจ้าของ restart server แล้ว ตรวจหน้าเว็บกับข้อมูล Google จริงหลัง restart ผ่านตัวอย่าง 3 ประเภทหน่วยบริการ เวลา 14:27–14:28 น. ยังเป็น read-only staging ไม่ใช่การทดสอบโหลดหรืออนุมัติ cutover

## สิ่งที่เปลี่ยน

- รวม mou_categories / mou_items / mou_settings / mou_agencies เป็น bounded values:batchGet หนึ่งคำขอ พร้อมตรวจ header และขนาดแยกทุกตาราง
- ใช้ metadata cache เฉพาะภายในคำขอ HTTP เดียว มี Map ใหม่ทุกคำขอ ใช้ OAuth client เดิม ไม่มีการ cache ค่าของตารางหรือสิทธิ์บัญชี
- users และ identities ยังอ่านสดตามลำดับเดิม ปิดบัญชีแล้วคำขอถัดไปถูกปฏิเสธ ไม่ batch บัญชีหรือผลประเมินรวมกับ reference
- ก่อนอ่าน reference/progress ยังคงตรวจสิทธิ์หน่วยบริการ; ตารางผิด/ข้อมูลขาดไม่ fallback เป็นศูนย์หรือข้อมูลสมมติ
- CLI diagnose-mou-read ใช้ request scope แบบเดียวกับเว็บ โดยไม่สร้าง session หรือเพิ่มสิทธิ์

API อ้างอิง: [Google Sheets values.batchGet](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet) รองรับหลายช่วงและคืนผลตามลำดับที่ขอ โดยใช้ scope readonly เดิม

## หลักฐานการทดสอบ

- 78 tests ผ่าน รวม batch allowlist, header สลับ/ขาด, grid เกินขนาด, fresh account reads, scope isolation, account revocation และ error redaction
- Mock selected-unit read workflow ลด Sheets GET จาก 17 เป็น 8 ครั้ง ไม่รวม OAuth refresh/retries ไม่ใช่ตัวเลขเวลาตอบสนองจริงหรือผล load test
- เทียบ snapshot ปี 2569 ทั้ง 74 หน่วยบริการด้วยเส้นทางอ่านเดิมและ batch ใหม่: model และ HTML ของ Dashboard/MOU ตรงกันทั้งหมด (ออฟไลน์ ไม่อ่าน/เขียน Google)
- Source/config checks ผ่าน
- เว็บที่รันก่อน restart: โรงพยาบาลท่าแพ 11404 ผ่าน 15/29 ข้อ (52%), กำลังดำเนินการ 1, ไม่มีแถวผล 13, ต้องแก้ไข 1, แสดง 5 หมวด ตรง snapshot
- เว็บที่รันก่อน restart: MOU หมวด 4 ของ 11404 ข้อ 4.1 มีสถานะกำลังดำเนินการ/ต้องแก้ไข และกดเปิดข้อเสนอแนะได้ในโหมดอ่านอย่างเดียว ไม่เปิดลิงก์หลักฐาน
- เว็บที่รันก่อน restart: สสอ.เมืองสตูล 00872 แสดงผ่าน 16/38 ข้อ (42%) และ 6 หมวด ตรง snapshot; หมวด 2 ทั้ง 3 ข้อแสดงยกเว้นตามประเภทหน่วยบริการ และกดเปิดข้อ 2.1 อ่านได้โดยไม่เปิดแก้ไข

## การใช้โค้ดใหม่

รอบล่าสุดดำเนินการแล้ว ไม่ต้อง restart ซ้ำจากผลตรวจครั้งนี้ คำสั่งด้านล่างเก็บไว้เป็นข้อมูลอ้างอิง

ใน PowerShell หน้าต่างที่กำลังรัน src/server.js ให้กด Ctrl+C แล้วเริ่มใหม่ ห้ามหยุด process อื่นหรือเริ่มซ้ำขณะ port 3000 ยังถูกใช้งาน

```powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\Codex\2026-09-01\new-chat\work\standard-portal-google'
$portalNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $portalNode --env-file-if-exists=.env.local src/server.js
```

เปิดอีกหน้าต่างหากต้องการวัด owner read ซ้ำ:

```powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\Codex\2026-09-01\new-chat\work\standard-portal-google'
$portalNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $portalNode scripts/diagnose-mou-read.js
```

## ผลตรวจหลัง restart

- สสอ.เมืองสตูล 00872 ปี 2569: reload หน้า MOU หมวด 2 ได้ 16/38 ข้อ (42%) ทั้ง 3 ข้อยกเว้นตามประเภทหน่วยบริการ และข้อ 2.1 กดเปิดอ่านได้
- โรงพยาบาลท่าแพ 11404 ปี 2569: เปลี่ยนหน่วยบริการด้วย dropdown + ปุ่มแสดงข้อมูลได้ 15/29 ข้อ (52%) แสดง 5 หมวด ไม่แสดงหมวด 6
- ท่าแพ หมวด 4 ข้อ 4.1: ยังแสดงกำลังดำเนินการ/ต้องแก้ไข และกดเปิดข้อเสนอแนะได้ในโหมดอ่านอย่างเดียว
- รพ.สต.ควนกาหลง 09625 ปี 2569: Dashboard อ่านได้ 10/38 ข้อ (26%) ตรง snapshot
- ไม่พบหน้า read-error ในการตรวจทั้ง 4 navigation ข้างต้น ไม่เปิดลิงก์หลักฐาน ไม่แก้ข้อมูลหรือสิทธิ์ ไม่รันนำเข้าซ้ำ
- ไม่อ้างตัวเลขความเร็วเพิ่มจากเวลาเครื่องมือ browser เพราะไม่ใช่การวัดที่เทียบกับ owner CLI baseline ได้โดยตรง จำนวน 17 → 8 เป็นหลักฐานจาก automated test เท่านั้น

## ข้อจำกัดที่ยังเหลือ

- ยังไม่ยืนยันความเร็วของโค้ดใหม่ผ่าน owner credentials; ผลเดิม 7,139 ms เป็น baseline ครั้งเดียว ไม่ใช่ benchmark
- สาเหตุ read-error ก่อนหน้ายังไม่ยืนยัน ไม่อ้างว่าแก้ timeout/quota ทุกกรณีแล้ว
- ยังไม่มี distributed quota control, load/concurrency test หรือ durable write coordination; metadata scope ไม่แก้ปัญหา concurrent edits ทั้งหมด
- ตัวอย่าง 3 ประเภทผ่านหลัง restart แล้ว ยังต้องตรวจรับข้อมูลส่วนที่เหลือ ประวัติย้อนหลังและสิทธิ์ไฟล์ก่อนเปิดเขียน
- ไม่มีการเขียน Sheets, เปลี่ยน OAuth scopes, แชร์ข้อมูล, เปิด Billing, แก้ production หรือ deploy GitHub/Vercel ในขั้นนี้
