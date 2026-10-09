import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readConfig } from '../src/config.js';
import { sessionCodec, equalToken, cookies } from '../src/session.js';
import { validateGoogleClaims, googleLogin } from '../src/google-login.js';
import { resolveAccess, requireHospital, assessments } from '../src/authorization.js';
import { parseTable, googleStore } from '../src/google-store.js';
import schema from '../src/schema.json' with { type: 'json' };
import { page } from '../src/page.js';

const config = () => readConfig({ SESSION_KEY_HEX: randomBytes(32).toString('hex') });
const identity = { provider: 'google', subject: 'subject-1', email: 'person@example.test' };
const mapping = { id: 'i-1', provider: 'google', provider_subject: 'subject-1', legacy_user_id: 'u-1', status: 'active', approved_by: 'admin-1', approved_at: '2026-09-03T00:00:00Z' };
const user = { id: 'u-1', role: 'hospital', hospital_id: '09625', account_status: 'active' };
const store = (identities = [mapping], users = [user]) => ({ table: async name => name === 'identities' ? identities : users });

test('remote HTTP and origin path/userinfo injection are rejected', () => {
  for (const origin of ['http://portal.example', 'https://user:pass@portal.example', 'https://portal.example/path', 'https://portal.example/?next=evil']) {
    assert.throws(() => readConfig({ APP_ORIGIN: origin }));
  }
  assert.equal(readConfig({ APP_ORIGIN: 'https://portal.example' }).secure, true);
});

test('session keys must contain 32 bytes', () => {
  assert.throws(() => readConfig({ SESSION_KEY_HEX: 'abc' }), /INVALID_SESSION_KEY/);
});

test('encrypted sessions round-trip and bind origin/purpose/expiry', async () => {
  let clock = new Date('2026-09-03T00:00:00Z');
  const c = config(), codec = sessionCodec(c, () => clock);
  const issued = await codec.issue('session', identity, 60);
  const header = issued.cookie.split(';')[0];
  assert.equal((await codec.read('session', header)).subject, identity.subject);
  assert.equal(await codec.read('flow', header.replace('portal_session=', 'portal_flow=')), null);
  assert.equal(await sessionCodec({ ...c, origin: 'https://other.example' }, () => clock).read('session', header), null);
  assert.equal(await codec.read('session', header.slice(0, -8) + 'tampered'), null);
  clock = new Date('2026-09-03T00:01:01Z');
  assert.equal(await codec.read('session', header), null);
});

test('production cookies are host-only secure HttpOnly SameSite=Lax', async () => {
  const c = { ...config(), secure: true, origin: 'https://portal.example' };
  const issued = await sessionCodec(c).issue('session', identity, 900);
  assert.match(issued.cookie, /^__Host-portal_session=/);
  for (const flag of ['Path=/', 'HttpOnly', 'SameSite=Lax', 'Secure']) assert.ok(issued.cookie.includes(flag));
  assert.ok(!issued.cookie.includes('Domain='));
});

test('duplicate cookies and non-matching tokens fail closed', () => {
  assert.throws(() => cookies('portal_session=one; portal_session=two'), /INVALID_COOKIE/);
  assert.equal(equalToken('a', 'aa'), false);
  assert.equal(equalToken(undefined, undefined), false);
  assert.equal(equalToken('abc', 'abc'), true);
});

test('Google login requests only identity scopes and uses state, nonce and PKCE', async () => {
  const c = config(); c.login = { clientId: 'test.apps.googleusercontent.com', clientSecret: 'test-secret' };
  const { url, flow } = await googleLogin(c).begin();
  const params = new URL(url).searchParams;
  assert.deepEqual(params.get('scope').split(' '), ['openid', 'email', 'profile']);
  assert.equal(params.get('access_type'), 'online');
  assert.equal(params.get('code_challenge_method'), 'S256');
  assert.equal(params.get('state'), flow.state);
  assert.equal(params.get('nonce'), flow.nonce);
  assert.ok(flow.codeVerifier.length >= 43);
});

test('Google claims reject wrong issuer, nonce, unverified email and expired ID tokens', () => {
  const good = { iss: 'https://accounts.google.com', sub: 'google-sub', email: 'a@example.test', email_verified: true, nonce: 'nonce-1', exp: 1001 };
  assert.equal(validateGoogleClaims(good, 'nonce-1', 1000000).subject, 'google-sub');
  for (const override of [{ iss: 'evil.example' }, { nonce: 'wrong' }, { email_verified: false }, { exp: 999 }, { sub: '' }]) {
    assert.throws(() => validateGoogleClaims({ ...good, ...override }, 'nonce-1', 1000000));
  }
});

test('owner email and first sign-in never bootstrap administrator access', async () => {
  const owner = { ...identity, email: 'dh.satun@gmail.com' };
  assert.deepEqual(await resolveAccess(owner, store([])), { status: 'unlinked' });
});

test('matching email is not sufficient to link a different Google subject', async () => {
  assert.deepEqual(await resolveAccess({ ...identity, subject: 'different' }, store()), { status: 'unlinked' });
});

test('pending and disabled identities cannot access user records', async () => {
  for (const status of ['pending', 'disabled']) {
    const s = { table: async name => { assert.equal(name, 'identities'); return [{ ...mapping, status }]; } };
    assert.deepEqual(await resolveAccess(identity, s), { status });
  }
});

test('ambiguous, unapproved, disabled-user and unknown-role mappings are rejected', async () => {
  await assert.rejects(resolveAccess(identity, store([mapping, { ...mapping, id: 'i-2' }])), /AMBIGUOUS/);
  await assert.rejects(resolveAccess(identity, store([{ ...mapping, approved_by: '' }])), /NOT_APPROVED/);
  await assert.rejects(resolveAccess(identity, store([mapping], [{ ...user, account_status: 'disabled' }])), /ACCOUNT_DISABLED/);
  await assert.rejects(resolveAccess(identity, store([mapping], [{ ...user, role: 'superuser' }])), /UNKNOWN_ROLE/);
});

test('approved hospital user retains leading zero and cannot cross hospitals', async () => {
  const access = await resolveAccess(identity, store());
  assert.equal(access.user.hospitalId, '09625');
  requireHospital(access, '09625');
  assert.throws(() => requireHospital(access, '9625'), /INVALID_HOSPITAL/);
  assert.throws(() => requireHospital(access, '09626'), /ACCESS_DENIED/);
  assert.throws(() => requireHospital({ status: 'pending' }, '09625'), /APPROVAL_REQUIRED/);
});

test('permissions are read again after a user is disabled', async () => {
  let active = true;
  const s = { table: async name => name === 'identities' ? [mapping] : [{ ...user, account_status: active ? 'active' : 'disabled' }] };
  assert.equal((await resolveAccess(identity, s)).status, 'active');
  active = false;
  await assert.rejects(resolveAccess(identity, s), /ACCOUNT_DISABLED/);
});

test('assessment filtering uses exact hospital and fiscal year; denied access reads no data', async () => {
  const access = await resolveAccess(identity, store());
  const s = { table: async () => [
    { hospital_id: '09625', fiscal_year: 2569 }, { hospital_id: '09626', fiscal_year: 2569 }, { hospital_id: '09625', fiscal_year: 2568 },
  ] };
  assert.equal((await assessments(s, access, 'mou', '09625', '2569')).length, 1);
  await assert.rejects(assessments({ table: () => assert.fail('Should not read') }, access, 'mou', '09626', '2569'), /DENIED/);
  await assert.rejects(assessments(s, access, '__proto__', '09625', '2569'), /UNKNOWN_MODULE/);
  await assert.rejects(assessments(s, access, 'mou', '09625', 'all'), /INVALID_FISCAL/);
});

test('schema contract excludes credentials and requires exact headers and text identifiers', () => {
  assert.ok(!JSON.stringify(schema).includes('password'));
  const headers = schema.users.headers;
  const values = headers.map(key => ({ ...user, _version: 0 }[key] ?? ''));
  const rows = parseTable('users', [headers, values]);
  assert.equal(rows[0].hospital_id, '09625');
  assert.equal(rows[0]._version, 0);
  assert.throws(() => parseTable('users', [['password_hash'], ['x']]), /SCHEMA_MISMATCH/);
  assert.throws(() => parseTable('users', [headers, values, values]), /INVALID_RECORD_ID/);
  const numericCode = [...values]; numericCode[headers.indexOf('hospital_id')] = 9625;
  assert.throws(() => parseTable('users', [headers, numericCode]), /IDENTIFIER_NOT_TEXT/);
});

test('Google store uses fixed bounded GET requests and refuses unknown or oversized tables', async () => {
  const calls = [], c = config();
  const client = { request: async options => {
    calls.push(options);
    if (options.url.includes('/values/')) return { data: { values: [schema.users.headers] } };
    return { data: { sheets: [{ properties: { title: 'users', gridProperties: { rowCount: 100, columnCount: 26 } } }] } };
  } };
  const s = googleStore(c, client);
  assert.deepEqual(await s.table('users'), []);
  assert.ok(calls.every(call => call.method === 'GET' && call.timeout === 8000));
  assert.ok(decodeURIComponent(calls[1].url).includes("'users'!A1:J100"));
  await assert.rejects(s.table('https://evil.example'), /UNKNOWN_TABLE/);
  const huge = googleStore(c, { request: async () => ({ data: { sheets: [{ properties: { title: 'users', gridProperties: { rowCount: 50000 } } }] } }) });
  await assert.rejects(huge.table('users'), /TABLE_LIMIT_EXCEEDED/);
});

test('Google upstream errors are sanitized, including canary credentials', async () => {
  const s = googleStore(config(), { request: async () => { throw new Error('SECRET-CANARY'); } });
  await assert.rejects(s.table('users'), error => error.code === 'GOOGLE_CONNECTION_FAILED' && !String(error).includes('CANARY'));
});

test('page escapes identity values and never implies that unlinked requests were saved', () => {
  const html = page({ identity: { subject: '<script>x</script>', email: '<img onerror=x>', name: '<script>x</script>' }, access: { status: 'unlinked' }, csrf: 'x"<y' });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img onerror'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('ยังไม่ได้ส่งคำขออนุมัติ'));
});
