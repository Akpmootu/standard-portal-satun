# นำเข้าข้อมูลอ้างอิง — สำเร็จ

## ผลล่าสุด 4 กันยายน 2026

อัปเดตถัดมา: ประเภทหน่วยบริการครบ 74 แห่งใน `mou_agencies` แล้ว รวม 2 แห่งที่ผู้ใช้ยืนยัน ปุ่มแสดงข้อมูลทดสอบใหม่หลังล็อกอินและรอโหลดครบแล้วผ่าน ดู [ขั้นที่ 3 และการ restart server](MOU_AGENCIES_STEP3_TH.md) ข้อความเรื่องกลุ่มว่าง/ฟอร์มด้านล่างเป็นสถานะตอนนำเข้า 4 ตารางแรก

นำเข้าและอ่านกลับเทียบต้นทางครบ 120 แถวแล้ว ไม่ต้องรัน import ซ้ำ

- SSH ที่ผ่านจริง: `administrator@192.168.0.44:22`, คีย์ `id_rsa`; เจ้าของรัน helper ใน PowerShell ปกติ ไม่เปลี่ยน ACL หรืออ่าน private key ผ่าน agent
- Snapshot: `.migration/mou-reference-2026-09-04T03-48-11-193Z.json`
- SHA256: `ac8546f74c3456f7adc7f4501095c170f42370a81e019cf6dee0b5f2a737cd2e`
- Application Data: `mou_categories!A2:F7` 6 แถว, `mou_items!A2:I39` 38 แถว, `mou_settings!A2:H3` 2 แถว
- Hospital Reference: `c_hosoffice!A2:AA75` 74 แถว; เติมเฉพาะชื่อ รหัสอ้างอิง hoscode และประเภทหน่วยบริการ อีก 23 คอลัมน์คงว่างตามขอบเขต
- อ่าน metadata/CellData ก่อนเขียน: header ตรง schema, ช่วงข้อมูลว่าง ไม่มีสูตร validation หรือ chips; บัญชี connector และ owner ทั้งสองไฟล์เป็น dh.satun@gmail.com, shared=false มี owner คนเดียว
- เขียน updateCells แบบ literal strings/numbers ไม่ใช้ USER_ENTERED; รักษารหัสนำหน้าศูนย์ ตรวจ readback ทุกเซลล์ ทุกแถว รูปแบบ และ header ตรงกัน ไม่มีแถวเกินแผน
- ขยายเฉพาะรูปแบบแถวข้อมูลจาก exemplar เดิม และปรับความสูงแถวข้อมูลหมวด/ตัวชี้วัด/หน่วยบริการหลังพบข้อความตัดในการตรวจหน้าตา Google Sheets ไม่เปลี่ยนความกว้างคอลัมน์หรือหัวตาราง
- Browser: บัญชี staging admin เปิด Dashboard เห็น 74 หน่วยบริการ 6 หมวด 38 ข้อและค่ารอบครบ; การ์ดหน่วยบริการ 09625 เปิด Dashboard รายหน่วยได้; ลิงก์ MOU เปิดแบบประเมินจริง และข้อ 1.1 ที่ล็อกกดขยายอ่านได้
- ข้อจำกัด QA: การเลือก dropdown แล้วกด “แสดงข้อมูล” ใน in-app browser ยังไม่เปลี่ยน URL แม้เลือกค่าได้ ไม่มี console error ที่อ่านพบ; ยังไม่ยืนยันเส้นทาง submit นี้ ต้องทดสอบต่อ ไม่อ้างว่าทุกปุ่มผ่านแล้ว
- Tests: 59 รายการผ่าน และ source/config checks ผ่าน

## ขอบเขตที่ยังไม่ทำ

ไม่มีการเขียน users/identities หรือให้สิทธิ์บัญชีใหม่ ไม่มีผลประเมิน/ไฟล์หลักฐานนำเข้า ไม่เปลี่ยนระบบ production, OAuth scopes, Billing, GitHub หรือ Vercel

การผูกกลุ่มยังไม่ครบ: แอปปัจจุบันอิง active users.user_group จึงยังแสดง “รอผูกประเภทหน่วยบริการ” แม้นำเข้ารายชื่อแล้ว คู่ hospital_id/user_group ใน snapshot เก็บไว้ทบทวนเท่านั้น ไม่สร้างบัญชีจากข้อมูลกลุ่ม

ต้นทางมี 2 กลุ่มว่าง: `11402` โรงพยาบาลควนโดน และ `11404` โรงพยาบาลท่าแพ อีก 72 หน่วยมีค่าเดียว ไม่มีค่ากำกวม ต้องยืนยันการจัดประเภทและแยก reference classification ออกจากสิทธิ์บัญชีก่อนเปิดบันทึกจริง

ขั้นถัดไป: (1) ผูกประเภทหน่วยบริการและตรวจการกรองหมวดให้ตรงของเดิม พร้อมตรวจ GET form submit (2) นำเข้าผลประเมินแบบทดลองหลังอนุมัติขอบเขต (3) ทำบันทึก/ตรวจผล/Drive พร้อมตรวจสิทธิ์และ concurrency (4) ทดสอบ backup/restore และความพร้อม แล้วจึง GitHub/Vercel โดยยังไม่ cutover ระบบเดิม

## บันทึกการเตรียมก่อนนำเข้าสำเร็จ (ประวัติ)

ข้อความด้านล่างเป็นประวัติช่วงเตรียมและวินิจฉัย ไม่ใช่สถานะปัจจุบัน ชื่อ `administrators` ที่เคยระบุไม่ใช่บัญชีที่ทดสอบผ่าน; บัญชีที่ถูกต้องคือ `administrator`

ตรวจบัญชี connector แล้วเป็น dh.satun@gmail.com และตรวจ metadata ชีต Application Data / Hospital Reference แล้ว การเข้าถึง RSA ใน `C:\Users\user\.ssh` ยังถูก Windows ปฏิเสธ แม้ได้รับ filesystem/network permission สำหรับงานนี้ ไม่ลด ACL และไม่คัดลอก key เพื่อหลีกเลี่ยงข้อจำกัด

## สิ่งที่เตรียม

- `scripts/export-mou-reference.php`: ทำงานแบบ CLI จาก stdin บน SSH ใช้ transaction READ ONLY และเลือกเฉพาะคอลัมน์อ้างอิง ไม่ติดตั้งไฟล์บน production
- `scripts/export-reference-local.js`: ให้เจ้าของรันใน Terminal ปกติ ใช้ SSH key/config ของบัญชี Windows เดิม ไม่อ่านหรือแสดง private key เอง ตรวจ host key แบบ strict ไม่เปิด password prompt
- `src/reference-import-plan.js`: ตรวจ source/columns/ID/ความสัมพันธ์ สร้างแผน 4 ตารางโดยยังไม่เขียน Google ปฏิเสธคอลัมน์ที่ไม่อยู่ในขอบเขต เช่น credentials
- `.migration/` อยู่ใน `.gitignore`; ไฟล์ส่งออกเป็นข้อมูลหน่วยบริการ/ตัวชี้วัด ไม่ใช่รหัสผ่านหรือผลประเมิน

ขอบเขตไฟล์: ชื่อ/รหัส/ประเภทหน่วยบริการเฉพาะโครงการ, หมวด, ตัวชี้วัด, รอบประเมิน และคู่ hospital_id/user_group เพื่อทบทวนการจัดประเภทเท่านั้น ไม่มี usernames, roles, passwords, identities, token, ผลประเมิน หรือไฟล์หลักฐาน ไม่สร้างหรืออนุมัติบัญชีจากข้อมูลกลุ่มนี้

## ให้เจ้าของรันหนึ่งครั้ง

เปิด PowerShell อีกหน้าต่างโดยไม่หยุดเซิร์ฟเวอร์เว็บ แล้วรัน:

```powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\Codex\2026-09-01\new-chat\work\standard-portal-google'
& 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/export-reference-local.js
```

เมื่อถาม `SSH username for 192.168.0.44` ให้ใส่ชื่อบัญชี SSH ที่ใช้เข้าระบบเดิม ไม่ใช่ Gmail หากไม่ทราบให้หยุดและตรวจชื่อบัญชีก่อน ห้ามเดาหรือส่ง private key ในแชต

ผลสำเร็จจะแสดงตำแหน่งไฟล์ `.migration/mou-reference-<timestamp>.json`, checksum และจำนวนรายการ ส่งเฉพาะข้อความผลลัพธ์หรือตำแหน่งไฟล์กลับมาได้ ไม่ต้องแนบ credentials

### ระบุคีย์เฉพาะโปรเจกต์

ผู้ใช้ยืนยันบัญชี SSH เป็น `administrators` และมีไฟล์ `hait-rg12_ed25519` อยู่ใน `.ssh` แล้ว จึงเพิ่ม argument สำหรับเลือกคีย์โดยตรง ยังไม่ยืนยันว่าคีย์นี้ได้รับอนุญาตจนกว่าจะทดสอบสำเร็จ:

```powershell
& 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/export-reference-local.js administrators "$env:USERPROFILE\.ssh\hait-rg12_ed25519"
```

ใช้ไฟล์ไม่มีนามสกุล `.pub` หรือ `.ppk` ตัวช่วยตรวจเพียงว่าเป็นไฟล์แล้วส่ง path ให้ OpenSSH ไม่อ่านเนื้อหา key และไม่เปลี่ยน ACL ยังคง `BatchMode=yes`, `StrictHostKeyChecking=yes` พร้อม `IdentitiesOnly=yes` เมื่อระบุคีย์ หาก key มี passphrase ต้องเตรียมใน SSH agent ของเจ้าของเอง ไม่ส่ง passphrase ในแชต

กรณี error:

หากระบุคีย์แล้วยังได้ `SSH_ACCOUNT_OR_KEY_NOT_READY` อย่าเดารหัสหรือเปลี่ยนสิทธิ์ ให้รันตัวตรวจต่อไปนี้ใน Terminal ปกติแล้วส่งเฉพาะ JSON สรุปกลับมา:

```powershell
& 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' scripts/check-reference-ssh.js administrators "$env:USERPROFILE\.ssh\hait-rg12_ed25519"
```

ตัวตรวจไม่อ่านฐานข้อมูลหรือเขียน Google ใช้คีย์และ configuration เดิม ตรวจปลายทางหลัง resolve ว่ายังเป็นเครื่องและบัญชีที่ระบุ คงการตรวจ host key และไม่พิมพ์ raw SSH log/key/fingerprint

- `SSH_PUBLIC_KEY_AUTH_FAILED`: public-key authentication ไม่ผ่าน ยังสรุปไม่ได้ว่าบัญชีหรือ authorized_keys ฝั่ง server ไม่ตรง
- `SSH_KEY_ACCEPTED_AUTH_INCOMPLETE`: มีคีย์ที่ server ตอบรับ แต่การยืนยันตัวตนยังไม่จบ ต้องตรวจ signing, passphrase หรือวิธียืนยันเพิ่มเติม
- `SSH_KEY_UNLOCK_OR_SIGNING_FAILED`: มีสัญญาณว่าปลดล็อกหรือเซ็นด้วยคีย์ไม่ได้ อย่าลบ passphrase หรือส่งในแชต
- `SSH_READY`: คำสั่งตรวจแบบอ่านอย่างเดียวผ่านแล้ว จึงกลับไปรัน export

- `SSH_ACCOUNT_OR_KEY_NOT_READY`: ตรวจชื่อบัญชีและ RSA ที่ใช้ใน Terminal ปกติ
- `SSH_HOST_KEY_REQUIRES_OWNER_CHECK`: ให้เจ้าของตรวจ fingerprint ของ host กับแหล่งที่เชื่อถือได้ ห้ามปิด StrictHostKeyChecking
- `SSH_NETWORK_UNAVAILABLE`: ตรวจ VPN/LAN ไปยัง 192.168.0.44
- `REFERENCE_EXPORT_VALIDATION_OR_STORAGE_FAILED`: ยังไม่มีไฟล์ที่รับรองได้ ต้องตรวจ schema/สิทธิ์โฟลเดอร์ก่อน ไม่แก้โดยข้าม validation

## หลังได้ไฟล์

1. ตรวจจำนวน/ID/หัวข้อ/รายการที่ขาดหรือกลุ่มหน่วยบริการกำกวมจากข้อมูลจริง
2. อ่าน metadata และ target CellData ใหม่ ตรวจชีตยังว่าง ไม่มีสูตร/validation ขัดแย้ง และไม่มีข้อมูลที่ต้องทับ
3. เขียนเฉพาะ 4 ตารางด้วย stringValue สำหรับ identifiers และข้อความ ไม่ใช้ USER_ENTERED ที่อาจตีความข้อมูลเป็นสูตร ขยายเฉพาะรูปแบบที่จำเป็นและคง header เดิม
4. อ่านกลับครบทุกแถวเทียบต้นทางและตรวจการแสดงผล Google Sheets
5. ทดสอบหน้าอ่านจริงจากบัญชีที่อนุมัติแล้ว การผูกประเภทหน่วยบริการแยกจากการให้สิทธิ์ผู้ใช้ ต้องทบทวนก่อนเปิดประเมิน

การทดสอบที่ทำแล้ว: Node tests 55 รายการผ่าน, source checks ผ่าน, PHP syntax ผ่าน การทดสอบเหล่านี้ยังไม่ใช่หลักฐานว่า SSH ส่งออกหรือนำเข้า Google สำเร็จ
