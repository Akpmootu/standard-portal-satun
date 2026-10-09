# ตั้งค่า Google Login และสิทธิ์อ่าน Sheets/Drive สำหรับ staging

บัญชีเจ้าของ: **dh.satun@gmail.com** — ขั้นตอนนี้ยังไม่ย้ายข้อมูลจริง ไม่อัปโหลดหลักฐาน ไม่แก้ production และไม่สมัครบริการเสียเงิน

การเชื่อมปลั๊กอิน Google Drive ใน Codex ใช้จัดการไฟล์ในบทสนทนา แต่ไม่ใช่ OAuth credentials สำหรับเว็บไซต์ของคุณ ต้องตั้งค่าแอปแยกตามขั้นตอนนี้

## 1. เตรียมโฟลเดอร์เก็บความลับด้วยบัญชี Windows ของคุณ

เปิด PowerShell / Windows Terminal ปกติด้วยบัญชีที่คุณใช้งานอยู่ ไม่รันคำสั่งนี้ผ่าน agent sandbox เพราะสิทธิ์ไฟล์อาจถูกผูกกับบัญชี sandbox แทนคุณ สคริปต์จะหยุดหากตรวจพบชื่อบัญชี CodexSandbox

```powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\Codex\2026-09-01\new-chat\work\standard-portal-google'
pnpm run setup:local
```

หากเครื่องไม่พบ `pnpm`, `node` หรือ PowerShell 7 ใช้ runtime ที่มีอยู่ในเครื่องนี้ โดยตั้งค่าเฉพาะ terminal ปัจจุบัน:

```powershell
$portalRuntime = 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies'
$env:PATH = "$portalRuntime\node\bin;$portalRuntime\bin\fallback;$env:PATH"
$env:PORTAL_PWSH = "$portalRuntime\native\powershell\pwsh.exe"
pnpm run setup:local
```

สคริปต์จะสร้าง `.secrets` จำกัดสิทธิ์ให้บัญชีผู้รัน, SYSTEM และ Administrators แล้วสร้าง session key แบบสุ่มใน `local-session.json` โดยไม่แสดงค่า ไม่เขียนทับ key เดิม หากตั้งค่าสิทธิ์ไม่สำเร็จ ให้หยุดและแจ้งเฉพาะข้อความผิดพลาด ไม่ต้องส่งไฟล์ความลับ

โฟลเดอร์นี้ป้องกันด้วยสิทธิ์ไฟล์ ไม่ใช่ encrypted vault; ผู้ดูแลเครื่องยังเข้าถึงได้ หลีกเลี่ยงการ sync/zip ทั้งโปรเจค และอย่าเก็บสำเนา client JSON ค้างใน Downloads ที่แชร์กับผู้อื่น

## 2. เตรียม Google Cloud project

อัปเดต 3 กันยายน 2026: สร้าง project `Standard Portal Staging` (ID: `standard-portal-staging`, number: `407808810116`) ในบัญชี dh.satun@gmail.com แล้ว และตรวจว่า Sheets API / Drive API แสดง Enabled ทั้งคู่ ไม่ต้องสร้างโปรเจกต์ซ้ำ ไม่ได้เปิด Billing หรือ Free Trial เจ้าของยอมรับ User Data Policy และกด Create เองแล้ว ตรวจชื่อแอป/อีเมลใน Branding และโหมด External/Testing แล้ว หลังเจ้าของยืนยัน ได้สร้าง OAuth client ทั้งสองตัวตามตารางในขั้น 3 และเพิ่ม dh.satun@gmail.com เป็นผู้ทดสอบสำเร็จ อย่าสร้าง client ซ้ำ

อัปเดต 4 กันยายน 2026: ไฟล์ Web Login และ Desktop client อยู่ใน `.secrets` ครบแล้ว ตรวจชนิดและ project ตรงกัน แต่ยังไม่ทดสอบ Login กับ Google จนครบ flow การรับ owner callback ครั้งล่าสุดจบด้วย `OWNER_AUTH_FAILED` และยังไม่มีไฟล์ token จึงยังยืนยันการเชื่อม Sheets/Drive ไม่ได้ ต้องเริ่ม consent รอบใหม่ด้วย helper ที่เพิ่มรหัสวินิจฉัยแล้ว รายละเอียดสถานะอยู่ใน `../../google-migration/google-cloud-setup.json`

1. เปิด [Google Cloud Console](https://console.cloud.google.com/) และตรวจว่าใช้ **dh.satun@gmail.com**
2. สร้างหรือเลือก project แยกสำหรับ `Standard Portal Staging` ไม่ต้องเปิด free trial, Billing หรือบริการที่ต้องผูกบัตร หากระบบขอ Billing ให้หยุดก่อน
3. ใน APIs & Services → Library เปิด **Google Sheets API** และ **Google Drive API**
4. ใน Google Auth Platform ตั้ง Branding เป็นชื่อแอปที่ระบุว่า staging พร้อม support/contact email ที่คุณรับผิดชอบ
5. สำหรับ Gmail ทั่วไป ใช้ Audience แบบ External และสถานะ Testing; เพิ่ม `dh.satun@gmail.com` ใน Test users ผู้ทดสอบอื่นต้องเพิ่มภายหลังเมื่อได้รับอนุญาต
6. ส่วน Data Access ให้ตรวจ scopes ตามตารางด้านล่าง ยังไม่ Publish app หรือเพิ่มสิทธิ์เขียน

ชื่อเมนูอาจต่างเล็กน้อยตามภาษา/เวอร์ชันของ Console การสร้าง OAuth credentials และ redirect URI ต้องทำใน project ของคุณเองตาม [คู่มือ Google สำหรับ Web Server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)

## 3. สร้าง OAuth client สองตัว

| ใช้สำหรับ | Application type | ชื่อแนะนำ | ไฟล์ที่ต้องบันทึกใน `.secrets` |
| --- | --- | --- | --- |
| ผู้ใช้ Login | Web application | Standard Portal Local Login | `google-login-client.json` |
| เจ้าของอนุญาตอ่านข้อมูล | Desktop app | Standard Portal Owner Storage Staging | `google-storage-client.json` |

**หาตัว Desktop client ได้ที่ไหน:** เปิด [รายการ Clients ของ Standard Portal Staging](https://console.cloud.google.com/auth/clients?authuser=1&project=standard-portal-staging) แล้วดูแถว `Standard Portal Owner Storage Staging` ชนิด Desktop ชื่อนี้เป็นชื่อใน Google Cloud ไม่ใช่ชื่อไฟล์ในเครื่อง

ไฟล์ทั้งสองตัวบันทึกแล้ว ไม่ต้องดาวน์โหลดหรือสร้าง client ซ้ำ อย่าส่งไฟล์หรือค่า secret ในแชต หากไฟล์สูญหายในภายหลัง ให้แจ้งก่อนเพิ่ม/เปลี่ยน secret เพราะหน้ารายละเอียด client ไม่ให้ดาวน์โหลด secret เดิมย้อนหลัง

ตัว Login ให้เพิ่ม Authorized redirect URI ตรงตามนี้ทุกตัวอักษร:

```text
http://127.0.0.1:3000/auth/google/callback
```

ไม่ใช้ URL ของ production PHP และไม่เปลี่ยน `127.0.0.1` เป็น `localhost` โดยไม่แก้ configuration ให้ตรงกัน flow นี้ใช้ server redirect ไม่ต้องใส่ JavaScript origin สำหรับ browser SDK; หากมีการกำหนด origin ให้ใช้ `http://127.0.0.1:3000`

ดาวน์โหลด JSON ตอนสร้าง client แล้วเปลี่ยนชื่อให้ตรงตาราง โดยไม่คัดลอกค่า secret ลงแชต สำหรับ Desktop client helper ใช้ loopback callback `http://127.0.0.1:8085/oauth2/callback` ตาม [Desktop OAuth flow ของ Google](https://developers.google.com/identity/protocols/oauth2/native-app); ไม่ใช้ JSON ชนิด Web แทน Desktop

โครงหลังขั้นตอนนี้:

```text
.secrets/
  local-session.json
  google-login-client.json
  google-storage-client.json
```

ไม่จำเป็นต้องสร้าง `.env.local` สำหรับค่าเริ่มต้น ตัว server อ่าน JSON ข้างต้นเฉพาะโหมด local ไฟล์เหล่านี้ถูกกันออกจาก Git และ Vercel upload แล้ว แต่ไม่สามารถป้องกันการแนบ/zip ด้วยตนเองได้

## 4. อนุญาตเฉพาะบัญชีเจ้าของด้วยตนเอง

ใน terminal เดิม:

```powershell
pnpm run auth:owner
```

หากไม่พบ `pnpm` ใช้คำสั่งตรงนี้ใน PowerShell ปกติของเจ้าของเครื่อง และเปิด terminal ค้างไว้ระหว่างอนุญาต:

```powershell
Set-Location -LiteralPath 'C:\Users\user\Documents\Codex\2026-09-01\new-chat\work\standard-portal-google'
& 'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --env-file-if-exists=.env.local scripts/authorize-owner.js
```

อย่ารันผ่านบัญชี `CodexSandbox`: helper จะตรวจการปกป้องโฟลเดอร์ก่อนเริ่ม consent และหยุดหากบัญชีไม่เหมาะสม โดยไม่ลดสิทธิ์ไฟล์เพื่อให้ผ่าน เมื่อ callback สำเร็จหรือล้มเหลว helper จะ redirect ไป `/result` เพื่อเอารหัส OAuth ออกจากแถบ URL และเปิดหน้าแสดงผลไว้ 2 นาที รหัสวินิจฉัยระบุขั้นที่ติด เช่น `OWNER_AUTH_EXCHANGE_invalid_grant` หรือ `OWNER_AUTH_SAVE_EACCES` โดยไม่เปิดเผยข้อความ error ดิบ หากพบ `ERR_CONNECTION_REFUSED` ให้ตรวจ terminal และเริ่มรอบใหม่จาก `/start` ไม่ใช้ URL callback หรือ authorization code เดิมซ้ำ

เปิด [หน้าเริ่ม owner consent ในเครื่อง](http://127.0.0.1:8085/start) ภายใน 5 นาที เลือก **dh.satun@gmail.com** และตรวจชื่อ project/app และสิทธิ์ก่อนอนุญาตด้วยตัวเอง หากพบคำเตือนที่ไม่เข้าใจ บัญชีไม่ตรง หรือสิทธิ์เกินรายการ ให้หยุด ไม่กดข้ามโดยไม่ตรวจ

| Flow | สิทธิ์ที่โค้ดขอ |
| --- | --- |
| Login ผู้ใช้งาน | `openid email profile` เท่านั้น ไม่มีสิทธิ์ Drive |
| Owner storage helper | `openid email`, `spreadsheets.readonly`, `drive.metadata.readonly` |

ข้อสำคัญ: owner scopes ข้างต้นสามารถอ่าน Sheets และ metadata ของไฟล์ในบัญชีได้กว้างกว่าโฟลเดอร์โปรเจค ไม่ใช่สิทธิ์ที่ Google จำกัดให้เฉพาะสามทรัพยากร โค้ดของแอปเป็นผู้จำกัด ID เป้าหมายเอง ให้ยินยอมเฉพาะเมื่อเข้าใจขอบเขตนี้ ไม่ได้ขอสิทธิ์เขียน แก้ sharing หรือดาวน์โหลดเนื้อหาไฟล์ Drive

helper ตรวจบัญชีเจ้าของและ scopes แล้วบันทึก refresh token เป็น `.secrets/google-storage-token.json` โดยไม่พิมพ์ค่าและไม่เขียนทับ token เดิม หากมี token เดิม/หมดอายุ ให้แจ้งเพื่อทำขั้นตอนเปลี่ยนอย่างเจาะจง ไม่ลบ token หรือถอนสิทธิ์แอปทั้งหมดโดยเดา

หากเคยเห็น `OWNER_AUTH_PRIVATE_STORAGE_NOT_READY` ข้อความเก่าไม่ได้ยืนยันว่ารันด้วยบัญชี sandbox เสมอไป รุ่นปรับปรุงจะเลือกรัน PowerShell จาก runtime ที่ใช้ Node โดยอัตโนมัติเมื่อมี และแยกรหัส `PRIVATE_STORAGE_SANDBOX_ACCOUNT`, `PRIVATE_STORAGE_ACL_WRITE_FAILED`, `PRIVATE_STORAGE_POLICY_BLOCKED` และ `PRIVATE_STORAGE_SHELL_MISSING` ให้ส่งเฉพาะรหัสกลับมา ไม่ปิด execution policy หรือเพิ่มสิทธิ์โฟลเดอร์แบบกว้างเพื่อข้ามปัญหา

แก้ไขกรณี `PRIVATE_STORAGE_ACL_WRITE_FAILED`: ตัวตั้งค่าสิทธิ์เปลี่ยนมาเขียนเฉพาะ DACL ด้วย .NET ไม่ส่ง owner/group/audit ไปเปลี่ยนด้วย และยังตรวจว่ามีเพียงบัญชีผู้รัน, SYSTEM และ Administrators หลังบันทึก ทดสอบกลไกนี้กับโฟลเดอร์จำลองโดยไม่แตะ credentials แล้ว ไม่ต้องรันเป็น administrator โดยอัตโนมัติ หากยังได้ `PRIVATE_STORAGE_ACL_ACCESS_DENIED` หรือ `PRIVATE_STORAGE_ACL_WRITE_FAILED` ให้แจ้งรหัสเพื่อวิเคราะห์ต่อ ก่อนเปลี่ยนเจ้าของหรือสิทธิ์ระบบ

`drive.metadata.readonly` เป็น restricted scope; การเปิดใช้จริงต้องประเมินข้อกำหนด verification และ security assessment ที่อาจเกี่ยวข้อง ซึ่งอาจกระทบเงื่อนไขไม่เสียเงิน ก่อน production ควรประเมินการเลือกไฟล์ด้วย `drive.file` เพื่อลดขอบเขตสิทธิ์ ห้ามถือว่าโครง staging นี้คือคำตอบ production ที่ฟรีแน่นอน [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

สำหรับ External app ใน Testing ที่ขอ data scopes แบบนี้ refresh token มีอายุ 7 วัน ต้องวางแผน production consent/การต่ออายุ ไม่ใช่สร้าง token ครั้งเดียวแล้วใช้ถาวร [Google OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)

## 5. ตรวจการเชื่อมต่อก่อน Login จริง

```powershell
pnpm run verify:google
pnpm start
```

หากมี staging server เก่าเปิด port 3000 อยู่ ให้ปิดเฉพาะ terminal ของ staging เก่าด้วย Ctrl+C ก่อนเริ่มใหม่ ไม่ปิด process อื่นแบบกว้าง ๆ

ตัวตรวจจะเช็ก owner, sharing และ header ของตารางที่ API ใช้กับทรัพยากรที่เตรียมไว้:

- [Application Data](https://docs.google.com/spreadsheets/d/1dWXmgRRg1yP39OSxl2PmFarlH1xAi1gaKy-rJc4Ve7k/edit)
- [Hospital Reference](https://docs.google.com/spreadsheets/d/10UtjMGPnBKeMasgtrwYs3SPbqSu-f_RIhPU2tHYAaJw/edit)
- [Evidence folder](https://drive.google.com/drive/folders/1d3PzVAq2dY7dToKVYHMq6IjBRLC7oMOi)

ตารางข้อมูลตอนนี้ควรมีจำนวน record เป็น 0 เพราะยังไม่ import จริง สถานะ “Configured” หมายถึงมีค่า configuration ไม่ใช่การรับรองว่า API/consent ใช้งานสำเร็จ ต้องใช้ผล `verify:google` ประกอบ

จากนั้นเปิด [Standard Portal staging](http://127.0.0.1:3000) และทดสอบ Google Login ด้วยตนเอง ผู้ล็อกอินที่ยังไม่มี identity mapping จะไม่เห็นข้อมูลประเมินและไม่เป็น admin แม้เป็นอีเมลเจ้าของ Drive

หน้าผู้ใช้จะแสดง Google subject ของตนไว้สำหรับการผูกบัญชี ขั้นตอนต่อไปต้องตรวจบัญชีผู้ใช้เดิมและอนุมัติ mapping ที่แน่นอน ไม่ย้ายรหัสผ่านเดิม ไม่เดาบัญชี admin และไม่บันทึกคำขออนุมัติโดยอัตโนมัติในโครง read-only นี้

## ส่งอะไรกลับมาได้บ้าง

แจ้งว่า “ตั้งค่า OAuth แล้ว” พร้อมผลสำเร็จหรือ error code ของ `verify:google` ได้ ไม่ต้องแนบ client JSON, Client Secret, token, session cookie, authorization code หรือภาพหน้าจอที่มีค่าเหล่านั้น

ขั้นถัดไปหลังเชื่อมสำเร็จ: ทดสอบสิทธิ์กับข้อมูลจำลอง → อนุมัติแผนย้ายบัญชี/ข้อมูล → ย้ายแต่ละ module → ทดสอบการเขียนพร้อมกันและ backup/restore → พิจารณา hosting/cutover โดยคงระบบเดิมไว้ rollback
