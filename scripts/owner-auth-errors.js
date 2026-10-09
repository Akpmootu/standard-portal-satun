const stages = new Set(['consent', 'exchange', 'identity', 'owner', 'scopes', 'save']);
const safeCodes = new Set([
  'CONSENT_NOT_COMPLETED', 'INVALID_CODE', 'MISSING_TOKEN', 'WRONG_OWNER',
  'MISSING_READ_SCOPE', 'INVALID_GOOGLE_IDENTITY', 'UNVERIFIED_GOOGLE_EMAIL',
  'INVALID_GOOGLE_NONCE', 'EXPIRED_GOOGLE_IDENTITY', 'EEXIST', 'EACCES', 'EPERM',
  'ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'invalid_grant', 'invalid_client', 'access_denied',
]);

// Never serialize an OAuth error: it can contain credentials, tokens and request URLs.
export function ownerAuthDiagnostic(stage, error) {
  const location = stages.has(stage) ? stage.toUpperCase() : 'UNKNOWN';
  const candidates = [error?.code, error?.cause?.code, error?.response?.data?.error, error?.message];
  const code = candidates.find(value => typeof value === 'string' && safeCodes.has(value));
  return `OWNER_AUTH_${location}_${code || 'FAILED'}`;
}

export function ownerAuthResult(diagnostic) {
  return diagnostic === 'SUCCESS'
    ? 'เชื่อมบัญชีเจ้าของแบบอ่านอย่างเดียวแล้ว กลับไปแจ้งว่าอนุญาตแล้วได้ ไม่ต้องคัดลอก token'
    : `ยังบันทึกการเชื่อมต่อไม่ได้ รหัสตรวจสอบ: ${diagnostic}\nแจ้งเฉพาะรหัสนี้ ไม่ส่ง URL, Client Secret หรือ token และอย่าโหลด callback เดิมซ้ำ`;
}
