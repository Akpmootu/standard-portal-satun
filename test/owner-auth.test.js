import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerAuthDiagnostic, ownerAuthResult } from '../scripts/owner-auth-errors.js';
import { privateStorageCode } from '../scripts/private-storage-errors.js';

test('private storage failures distinguish account, ACL, runtime and policy without dumping errors', () => {
  assert.equal(privateStorageCode({stdout: Buffer.from('PRIVATE_STORAGE_SANDBOX_ACCOUNT\r\n')}), 'PRIVATE_STORAGE_SANDBOX_ACCOUNT');
  assert.equal(privateStorageCode({stdout: 'PRIVATE_STORAGE_ACL_WRITE_FAILED'}), 'PRIVATE_STORAGE_ACL_WRITE_FAILED');
  assert.equal(privateStorageCode({code: 'ENOENT'}), 'PRIVATE_STORAGE_SHELL_MISSING');
  assert.equal(privateStorageCode({stderr: 'PSSecurityException: private-test-credential'}), 'PRIVATE_STORAGE_POLICY_BLOCKED');
  assert.equal(privateStorageCode({stdout: 'private-test-credential', stderr: 'private-test-credential'}), 'PRIVATE_STORAGE_SETUP_FAILED');
});

test('owner diagnostics expose only allowlisted stages and codes', () => {
  assert.equal(ownerAuthDiagnostic('exchange', {response: {data: {error: 'invalid_grant'}}}), 'OWNER_AUTH_EXCHANGE_invalid_grant');
  assert.equal(ownerAuthDiagnostic('save', {code: 'EACCES'}), 'OWNER_AUTH_SAVE_EACCES');
  assert.equal(ownerAuthDiagnostic('identity', new Error('INVALID_GOOGLE_NONCE')), 'OWNER_AUTH_IDENTITY_INVALID_GOOGLE_NONCE');
  assert.equal(ownerAuthDiagnostic('exchange', {cause: {code: 'ENOTFOUND'}}), 'OWNER_AUTH_EXCHANGE_ENOTFOUND');
});

test('owner diagnostics never echo arbitrary secret-bearing error fields', () => {
  const secret = 'private-test-credential';
  const error = {message: secret, code: secret, cause: {code: secret}, response: {data: {error: secret}}, stack: secret};
  const diagnostic = ownerAuthDiagnostic(secret, error);
  assert.equal(diagnostic, 'OWNER_AUTH_UNKNOWN_FAILED');
  assert.ok(!ownerAuthResult(diagnostic).includes(secret));
  assert.equal(ownerAuthDiagnostic('save', undefined), 'OWNER_AUTH_SAVE_FAILED');
});
