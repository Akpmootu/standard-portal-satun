const codes = new Set([
  'PRIVATE_STORAGE_SANDBOX_ACCOUNT', 'PRIVATE_STORAGE_PATH_INVALID',
  'PRIVATE_STORAGE_ACL_READ_FAILED', 'PRIVATE_STORAGE_ACL_WRITE_FAILED', 'PRIVATE_STORAGE_ACL_ACCESS_DENIED',
  'PRIVATE_STORAGE_ACL_VERIFY_FAILED', 'PRIVATE_STORAGE_DIRECTORY_FAILED',
  'PRIVATE_STORAGE_POLICY_BLOCKED', 'PRIVATE_STORAGE_SHELL_MISSING',
  'PRIVATE_STORAGE_ACCESS_DENIED', 'PRIVATE_STORAGE_SETUP_FAILED',
]);

export function privateStorageCode(error) {
  if (codes.has(error?.code)) return error.code;
  const marker = String(error?.stdout || '').trim();
  if (codes.has(marker)) return marker;
  if (error?.code === 'ENOENT') return 'PRIVATE_STORAGE_SHELL_MISSING';
  if (['EACCES', 'EPERM'].includes(error?.code)) return 'PRIVATE_STORAGE_ACCESS_DENIED';
  if (/PSSecurityException|UnauthorizedAccess|running scripts is disabled/i.test(String(error?.stderr || ''))) {
    return 'PRIVATE_STORAGE_POLICY_BLOCKED';
  }
  return 'PRIVATE_STORAGE_SETUP_FAILED';
}
