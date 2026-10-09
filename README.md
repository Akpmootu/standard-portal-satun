# Standard Portal · Satun Digital Health

สถานะออนไลน์ล่าสุด 9 ตุลาคม 2569: Google Login / ลงทะเบียน / MOU เปิดแล้ว เพิ่ม CTAM และ HAIT ตามกติกาเดิม อ่าน [ผลรุ่นล่าสุดและงานที่เหลือ](docs/RELEASE_2026_10_09_TH.md) ก่อนใช้สถานะเก่าด้านล่าง ยังไม่ได้ย้ายทั้งระบบหรือสลับแทนระบบเดิม

เว็บหลัก: https://standard-portal-satun.vercel.app


สถานะล่าสุด 7 กันยายน 2026: **ปิดงานนำเข้าประวัติ MOU ปี 2569 แล้ว** ตรวจชีตสดตรงกับ snapshot ครบ 95 ประวัติ / 1,353 ผล และคง pending 16 รายการ ตรวจหน้าตาชีตผ่าน ไม่ต้องนำเข้าซ้ำ เพิ่มหน้าประวัติผู้ดูแล `/mou/history` พร้อม 96 tests ผ่าน — เจ้าของ restart แล้วและทดสอบหน้าเว็บจริงผ่าน ดู [ผลตรวจและขั้นต่อไป](docs/MOU_HISTORY_VERIFIED_STEP6_TH.md)

สถานะ 4 กันยายน 2026: นำเข้าข้อมูลอ้างอิง 74 หน่วยบริการ / 6 หมวด / 38 ข้อ / 2 ค่ารอบ และประเภท `mou_agencies` ครบแล้ว นำเข้าผล MOU ปี 2569 จำนวน 1,353 รายการจาก 65 หน่วยบริการลง Sheets staging และอ่านกลับเทียบทุกเซลล์ผ่าน — ยังไม่ย้ายระบบเสร็จและยังห้าม cutover

ขั้นปัจจุบัน: [ผลนำเข้า MOU ปี 2569 และสิ่งที่ต้องทำต่อ](docs/MOU_PROGRESS_IMPORT_STEP4_TH.md) ไม่ต้องส่งออกหรือนำเข้าซ้ำ ห้ามส่งไฟล์ .migration หรือ credentials ขึ้น GitHub

ขั้นที่ 6 เสร็จแล้ว: [ผลตรวจและหน้าประวัติผู้ดูแล](docs/MOU_HISTORY_VERIFIED_STEP6_TH.md) ไม่ต้องส่งออกหรือนำเข้าซ้ำ ส่วนลิงก์หลักฐานยังตรวจเฉพาะยอดรวม ไม่ได้ตรวจสิทธิ์ปลายทาง

ขั้นที่ 5: [ลดคำขอ Google และตรวจผลหลายประเภทหน่วยบริการ](docs/MOU_READ_RELIABILITY_STEP5_TH.md) mock read path ลด 17 เหลือ 8 GETs, เทียบ snapshot ทั้ง 74 แห่งได้ผลเดิม, 78 tests ผ่าน เจ้าของ restart แล้วและตรวจเว็บจริงตัวอย่าง สสอ./โรงพยาบาล/ปฐมภูมิผ่านวันที่ 4 กันยายน 2026 เวลา 14:27–14:28 น. ไม่ต้อง restart ซ้ำจากผลตรวจนี้

ผลตรวจล่าสุด: เจ้าของรัน diagnostic สำเร็จใน 7,139 ms และตรวจหน้า MOU จริงของ 09625 ซ้ำผ่านแล้ว แสดง 10/38 ข้อ (26%) และเปิดรายละเอียดข้อ 1.1 ที่ล็อกได้ โดยไม่บันทึกหรือเปิดไฟล์หลักฐาน สาเหตุ read-error ก่อนหน้ายังไม่ยืนยัน ต้องปรับความทนทาน/ประสิทธิภาพและทดสอบโหลดก่อนเปิดการเขียนหรือ deploy

อ่าน [ขั้นที่ 3: ประเภทหน่วยบริการและวิธีเปิดโค้ดใหม่](docs/MOU_AGENCIES_STEP3_TH.md) ปุ่ม “แสดงข้อมูล” ทดสอบหลังล็อกอินและรอโหลดครบแล้วใช้งานได้ ไม่ต้องแก้ CSP หรือฟอร์ม

## ขั้นที่ 2: หน้าอ่านข้อมูลจาก Sheets

การนำเข้าข้อมูลอ้างอิง: สำเร็จผ่าน SSH บัญชี `administrator` (ไม่มี s) และคีย์ `id_rsa` ที่เจ้าของรันเอง นำเข้าเฉพาะ 4 ตาราง staging แล้ว ดู [หลักฐานและสิ่งที่ต้องทำต่อ](docs/REFERENCE_IMPORT_STATUS_TH.md) ไม่ต้องส่งออกหรือนำเข้าซ้ำ

อ่าน [ผลตรวจล่าสุดและวิธีเปิดเวอร์ชันใหม่](docs/MOU_READ_STEP2_TH.md) แล้ว restart เซิร์ฟเวอร์ใน Terminal ปกติของคุณ เข้า `/dashboard` และ `/mou` ด้วยบัญชีที่อนุมัติแล้ว หน้าเหล่านี้อ่านชีตจริง ไม่โหลด fixtures; หากชีตว่างจะแสดงรอนำเข้าข้อมูล ไม่สร้างผลประเมินขึ้นเอง

## ทดลอง Dashboard และ MOU ใหม่

อ่าน [สิ่งที่ทำในขั้นที่ 1 และแผนขั้นถัดไป](docs/DASHBOARD_MOU_STEP1_TH.md)

```powershell
& 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/preview-ui.js
```

เปิด `http://127.0.0.1:3001/demo/dashboard` หรือ `http://127.0.0.1:3001/demo/mou` เซิร์ฟเวอร์ตัวนี้ไม่อ่าน `.env` / `.secrets` ไม่เรียก Google และไม่ต้องติดตั้ง pnpm เพิ่ม ผลทดลองอยู่ในหน่วยความจำของหน้าเว็บเท่านั้น รีเฟรชแล้วหาย

ผู้ที่รันเซิร์ฟเวอร์ปกติบนพอร์ต 3000 อยู่ ต้องหยุดแล้วเริ่มใหม่ใน Terminal ของตนเองเพื่อโหลดโค้ดใหม่ จากนั้นบัญชีที่อนุมัติแล้วจะเห็นปุ่มเปิด Dashboard ในหน้าแรก ไม่ต้องขอ owner consent ใหม่สำหรับการทดลอง UI

## เริ่มตรงนี้

อ่าน [คู่มือตั้งค่า Google OAuth ภาษาไทย](docs/GOOGLE_SETUP_TH.md) แล้วตั้งค่าด้วยบัญชี Windows ปกติของคุณ ไม่ส่ง client JSON, Client Secret หรือ token ในแชต

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm check
pnpm start
```

ต้องมี Node.js 22 ขึ้นไป เปิด `http://127.0.0.1:3000` ได้โดยยังไม่มี credentials; ปุ่ม Login จะปิดอยู่พร้อมบอกสิ่งที่รอตั้งค่า เซิร์ฟเวอร์รับเฉพาะ loopback ไม่เปิดให้เครื่องอื่นในเครือข่าย

## สิ่งที่ทำแล้ว

- Google authorization-code flow พร้อม PKCE, state, nonce และตรวจ ID token ด้วย Google Auth Library
- Session เข้ารหัส อายุ 15 นาที; cookies HttpOnly / SameSite=Lax และ Secure เมื่อใช้ HTTPS
- แยก Google Login ของผู้ใช้จาก OAuth ของเจ้าของ Sheets/Drive; ไม่เก็บ access token ของผู้ใช้ทั่วไป
- ผูกสิทธิ์ด้วย provider + Google subject และบัญชีเดิมที่ผู้ดูแลอนุมัติ ไม่ให้ admin จากอีเมลหรือผู้ล็อกอินคนแรก
- ตรวจสถานะบัญชีและสิทธิ์ใหม่ทุกคำขอ; ป้องกัน hospital user อ่านข้ามหน่วยบริการ
- อ่าน Sheets เฉพาะตารางที่กำหนด ตรวจ header / ID / ขนาดตาราง และรักษาศูนย์นำหน้ารหัสหน่วยบริการ
- ตัวตรวจเจ้าของและการแชร์ของ Sheets สองไฟล์กับโฟลเดอร์หลักฐาน; ไม่เปิด sharing ให้สาธารณะ
- หน้า staging ภาษาไทยพร้อม responsive layout และสถานะการตั้งค่าที่ไม่อ้างว่าเชื่อมต่อสำเร็จ
- Dashboard และแบบประเมิน MOU ใช้ธีมเดียวกัน รองรับมือถือ และจำลองสถานะ/ลิงก์หลักฐาน/การบันทึก/ผลตรวจ พร้อมเงื่อนไขล็อกตามหน้าเดิม
- เพิ่มหน้าอ่าน MOU จาก Sheets โดยจับคู่ ID จริง แยกหน่วยบริการ/ปี และเปิดอ่านข้อที่ล็อกได้ ไม่เปิดการเขียนข้อมูล
- ทดสอบอัตโนมัติ 96 รายการและ source checks ผ่าน ณ 7 กันยายน 2026; ไม่ได้รัน dependency audit ใหม่ในขั้นนี้

## API ที่มี

| Route | เงื่อนไข / ผลลัพธ์ |
| --- | --- |
| `GET /api/health` | สถานะโครง staging; ไม่ใช่ผลทดสอบ Google สด |
| `GET /auth/google` | เริ่ม Google Login เมื่อกำหนดค่าแล้ว |
| `GET /auth/google/callback` | ตรวจ OAuth แล้วสร้าง session |
| `POST /auth/logout` | ต้องมี Origin และ CSRF token ถูกต้อง |
| `GET /api/me` | ตัวตนของผู้ล็อกอินและสถานะการอนุมัติ |
| `GET /api/assessments?module=mou&hospital_id=09625&fiscal_year=2569` | ผู้ใช้ที่อนุมัติแล้วและมีสิทธิ์หน่วยบริการ; module รองรับ mou / ctam / hait |
| `GET /api/admin/storage-check` | ผู้ดูแลที่อนุมัติแล้วเท่านั้น |
| `GET /dashboard`, `GET /mou` | ต้องล็อกอินและอนุมัติแล้ว; อ่านชีตจริงตามหน่วยบริการ/ปี; ชีตว่างแสดงสถานะรอนำเข้า |
| `GET /demo/dashboard`, `GET /demo/mou` | เฉพาะ local origin; ข้อมูลสมมติล้วน ไม่อ่านสิทธิ์/ผลประเมินจาก Google |

CLI `pnpm verify:google` ใช้ทดสอบการเชื่อมต่อครั้งแรกได้โดยไม่ต้องสร้าง admin ล่วงหน้า ไม่ใช่ endpoint สาธารณะ

CLI `verify:mou` (หรือรัน `scripts/verify-mou.js` ด้วย Node ใน Terminal ปกติ) ตรวจทรัพยากรและนับข้อมูลอ้างอิงโดยไม่พิมพ์ข้อมูลรายบุคคล/credentials ต้องใช้สิทธิ์เจ้าของที่ตั้งค่าไว้แล้ว ไม่ได้เพิ่มสิทธิ์ admin ในเว็บ

## ยังไม่เสร็จ / ห้าม cutover

- Google Login, owner read-only connection และบัญชี staging admin ผ่านการตรวจแล้วในขั้นก่อนหน้า ดู `docs/STAGING_ADMIN_APPROVAL.md`; ไม่เปิด Billing หรือขยาย OAuth scopes ในขั้นนี้
- Google Sheets มีข้อมูลอ้างอิงและผล MOU ปี 2569 พร้อมลิงก์หลักฐานแล้ว และประวัติ MOU ปี 2569 แล้ว แต่ยังไม่ย้ายตัวไฟล์ ปีอื่น หรือผล CTAM/HAIT; บัญชี staging admin/identity เดิมไม่ถูกเปลี่ยนในรอบนำเข้า
- ผู้ใช้อื่นยังต้องตรวจบัญชีเดิมและอนุมัติอย่างชัดเจน ไม่มี automatic admin bootstrap
- เพิ่มโค้ดบันทึก/ส่งตรวจ/อนุมัติ/ส่งกลับแก้ไข MOU และ signed Apps Script writer พร้อม version check, request receipts และ audit แล้ว; ยังไม่ deploy writer หรือเปิดการเขียนจริง ดู `docs/MOU_WRITE_STEP7_TH.md`
- ยังไม่เปิดอัปโหลด/ดาวน์โหลดไฟล์
- ยังไม่ย้าย business rules และหน้า PHP ทั้งระบบ; LINE Login ยังไม่ทำ
- ต้องเพิ่มดัชนี/แคชที่ไม่รั่วสิทธิ์และ distributed quota/rate control ก่อนใช้งานพร้อมกันจริง
- Logout ล้าง cookie ใน browser; ยังไม่มี server-side session registry สำหรับยกเลิก session ที่ถูกขโมยทั้งหมดทันที การปิดบัญชี/identity จะตัดสิทธิ์ข้อมูลในคำขอถัดไป
- ต้องทดสอบ token หมดอายุ/ถูกถอน, quota, ข้อมูลมาก, concurrent writes, backup/restore และ rollback ก่อนเปิดจริง
- Vercel adapter มีไว้เตรียมการเท่านั้น: default ตอบ 503 จนตั้ง `ALLOW_PUBLIC_STAGING=1`; ยังไม่ deploy หรือรับรองว่าเข้าเงื่อนไขแผนฟรี อย่าเปิด gate จนผ่านการตรวจพร้อมใช้งานและได้รับอนุญาต
- ไม่เปลี่ยน production บน `192.168.0.44`; รอบนี้คัดลอกเฉพาะ snapshot ผล MOU ปี 2569 ลง staging ไม่ใช่การ sync ต่อเนื่องหรือย้ายระบบเต็มรูปแบบ

## โครงไฟล์

- `src/`: HTTP routes, OAuth, session, authorization และ Google read-only repository
- `src/schema.json`: contract จาก workbook ที่ตรวจไว้ ไม่รวม password fields
- `scripts/`: ตั้งค่าความลับในเครื่อง, owner consent และตรวจ resources
- `test/`: unit/HTTP security tests ใช้ข้อมูลจำลอง ไม่ใช้ credentials จริง
- `api/` + `vercel.json`: adapter ที่ยังปิดการให้บริการสาธารณะ
- `.secrets/`: สร้างภายหลังโดยเจ้าของเครื่อง; ห้ามแชร์ทั้งโฟลเดอร์โปรเจคหรือ zip โดยไม่ตัดโฟลเดอร์นี้และไฟล์ `.env*` ออก

รายละเอียดทรัพยากร Google ที่สร้างก่อนหน้านี้อยู่ใน `../google-migration/google-resources.json` และแผน migration เดิมอยู่ใน `../google-migration/README.md`

## ลงทะเบียนและผู้ตรวจ (11 กันยายน 2569)

เพิ่ม /register, /admin/registrations และ /mou/reviews ผู้สมัครไม่เลือกบทบาทเอง แอดมินเดิมอนุมัติและกำหนด scope ผู้ตรวจ ชื่อผู้ตรวจมาจากโปรไฟล์ที่อนุมัติ โค้ดนี้ต้องอัปเดต Apps Script เป็น protocol v2 และสร้างสองตารางใหม่ก่อน restart ดู `docs/REGISTRATION_REVIEWER_TH.md` ยังไม่เปิด deployment รุ่นนี้หรือเพิ่มสิทธิ์บัญชีจริง
