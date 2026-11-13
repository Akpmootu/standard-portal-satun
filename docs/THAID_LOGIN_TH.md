# เข้าสู่ระบบด้วย ThaID (สถานะ: ทดสอบในเครื่องเท่านั้น ยังไม่ deploy)

## หลักการ

- ThaID เป็น**บัญชีแยก**จาก Google: ผู้ใช้ล็อกอิน ThaID → ลงทะเบียน (กรอกอีเมลติดต่อเอง เพราะ ThaID ไม่ส่งอีเมล) → แอดมินอนุมัติเหมือนผู้ใช้ Google
- **ไม่เก็บเลขประจำตัวประชาชน**: ระบบเก็บแค่ `HMAC-SHA256(THAID_SUBJECT_KEY_HEX, pid)` เป็น `provider_subject` (provider = `thaid`)
- `THAID_SUBJECT_KEY_HEX` ต้องสร้างครั้งเดียวและ**ห้ามเปลี่ยน** ถ้าเปลี่ยน ผู้ใช้ ThaID ทุกคนจะผูกบัญชีเดิมไม่ได้
- ปุ่ม ThaID จะแสดงก็ต่อเมื่อตั้งค่า `THAID_CLIENT_ID`, `THAID_CLIENT_SECRET`, `THAID_SUBJECT_KEY_HEX` ครบ
- token จาก ThaID (access/refresh) ไม่ถูกเก็บ ใช้แค่ตอนแลกข้อมูลครั้งเดียว

## ทดสอบในเครื่องด้วย Mock ThaID (ไม่ต้องมี client จาก DOPA)

เพิ่มใน `.env.local`:

```
THAID_CLIENT_ID=local-thaid-client
THAID_CLIENT_SECRET=local-thaid-secret
THAID_SUBJECT_KEY_HEX=<openssl rand -hex 32>
THAID_AUTH_URL=http://127.0.0.1:3901/api/v2/oauth2/auth/
THAID_TOKEN_URL=http://127.0.0.1:3901/api/v2/oauth2/token/
```

เปิด 2 terminal:

```bash
npm run mock:thaid
```

```bash
npm start
```

เปิด http://127.0.0.1:3000 → กด "เข้าสู่ระบบด้วย ThaID" → เลือกผู้ใช้ทดสอบ → อนุญาต → กลับมาหน้าแรกในสถานะล็อกอินแล้ว
(URL แบบ `http://` อนุญาตเฉพาะ 127.0.0.1/localhost ตอน APP_ORIGIN เป็น local เท่านั้น)

## ใช้กับ ThaID จริง (ภายหลัง)

1. ขอ client ID/secret จาก DOPA และลงทะเบียน redirect URI `<APP_ORIGIN>/auth/thaid/callback`
2. ลบ `THAID_AUTH_URL` / `THAID_TOKEN_URL` ออก (ใช้ค่า default ของ DOPA) หรือกำหนดตามที่ DOPA แจ้ง
3. ค่า scope ตั้งต้น `pid name` ปรับได้ด้วย `THAID_SCOPE`
4. **ต้อง build และ deploy Apps Script writer ใหม่** (`node scripts/build-mou-writer.js` แล้วนำ `apps-script/build/Writer.gs` ไป deploy) ไม่งั้นการลงทะเบียน/บันทึกของผู้ใช้ ThaID จะถูก writer ตัวเดิมปฏิเสธ (`SIGN_IN_REQUIRED`)

## สิ่งที่ต้องยืนยันกับ DOPA ก่อนขึ้นจริง

- endpoint และรูปแบบ token response จริง (โค้ดรองรับ `pid`/`name` ทั้งแบบ top-level และใน `id_token`, ตรวจ `aud` และ `exp` ถ้ามี)
- ว่ารองรับ `http://localhost` เป็น redirect URI หรือไม่ (ถ้าไม่ ต้องทดสอบของจริงบน staging ที่มี HTTPS)
