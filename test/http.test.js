import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readConfig } from '../src/config.js';
import { sessionCodec } from '../src/session.js';
import { createApp } from '../src/app.js';
import vercelHandler from '../api/index.js';
import {PortalError} from '../src/errors.js';

async function fixture(t, overrides = {}) {
  const config = readConfig({ SESSION_KEY_HEX: randomBytes(32).toString('hex'), GOOGLE_LOGIN_CLIENT_ID: 'fake',
    GOOGLE_LOGIN_CLIENT_SECRET: 'fake', GOOGLE_STORAGE_CLIENT_ID: 'fake', GOOGLE_STORAGE_CLIENT_SECRET: 'fake', GOOGLE_STORAGE_REFRESH_TOKEN: 'fake' });
  const codec = sessionCodec(config);
  const store = overrides.store || { table: async () => [] };
  const login = overrides.login || { begin: async () => ({ flow: { state: 'expected-state', nonce: 'n', codeVerifier: 'v' }, url: 'https://accounts.google.com/o/oauth2/v2/auth' }),
    complete: async () => ({ provider: 'google', subject: 'test-sub', email: 'test@example.test', name: 'Test' }) };
  if (overrides.noLogin) config.login = { clientId: '', clientSecret: '' };
  const server = createServer(createApp(config, { codec, store, login }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  config.origin = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = (path, options = {}) => fetch(config.origin + path, { redirect: 'manual', ...options });
  return { config, codec, request };
}

test('quota failures return a bounded Retry-After without exposing provider details',async t=>{
 const error=Object.assign(new PortalError('GOOGLE_QUOTA_EXCEEDED',503),{retryAfter:60});
 const {request,codec}=await fixture(t,{store:{table:async()=>{throw error;}}});
 const cookie=(await codec.issue('session',{provider:'google',subject:'test-sub'},60)).cookie.split(';')[0];
 const response=await request('/api/me',{headers:{cookie}});
 assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'60');
 assert.deepEqual(await response.json(),{error:'GOOGLE_QUOTA_EXCEEDED'});
 const publicResponse=await request('/api/public/progress');
 assert.equal(publicResponse.status,503);assert.equal(publicResponse.headers.get('retry-after'),'60');
 assert.deepEqual(await publicResponse.json(),{error:'PUBLIC_SUMMARY_UNAVAILABLE'});
});

test('unconfigured landing is readable and login is disabled', async t => {
  const { request } = await fixture(t, { noLogin: true });
  const res = await request('/');
  assert.equal(res.status, 200); assert.match(await res.text(), /รอตั้งค่า Google Login/);
  assert.match(res.headers.get('content-security-policy'),/font-src 'self'/);
  for(const [path,type] of [['/satun-coast.webp','image/webp'],['/satun-thai.woff2','font/woff2'],['/satun-latin.woff2','font/woff2']]){
    const asset=await request(path);assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),type);assert.ok((await asset.arrayBuffer()).byteLength>1000);
  }
  assert.equal((await request('/auth/google')).status, 503);
  assert.equal((await request('/api/health')).status, 200);
});

test('HTTP requests create isolated store scopes and observe account revocation',async t=>{
 let active=true,scopes=0;
 const store={forRequest:()=>{scopes++;return {table:async name=>name==='identities'?[{provider:'google',provider_subject:'test-sub',legacy_user_id:'u1',status:'active',approved_by:'a',approved_at:'x'}]:[{id:'u1',role:'admin',account_status:active?'active':'disabled'}]};}};
 const {request,codec}=await fixture(t,{store});const token=await codec.issue('session',{provider:'google',subject:'test-sub'},60);
 const headers={cookie:token.cookie.split(';')[0]};
 assert.equal((await request('/api/me',{headers})).status,200);active=false;
 assert.equal((await request('/api/me',{headers})).status,403);assert.equal(scopes,2);
});

test('unauthenticated API and write attempts fail without reading Sheets', async t => {
  const { request } = await fixture(t, { store: { table: () => assert.fail('Unexpected data read') } });
  assert.equal((await request('/api/assessments?module=mou&hospital_id=09625&fiscal_year=2569')).status, 401);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await request('/api/assessments', { method })).status, 405);
});

test('OAuth start sets encrypted flow cookie; bad state does not exchange a code', async t => {
  const { request, codec } = await fixture(t, { login: {
    begin: async () => ({ flow: { state: 'correct-state' }, url: 'https://accounts.google.com/o/oauth2/v2/auth' }),
    complete: async () => assert.fail('Code must not be exchanged'),
  } });
  const res = await request('/auth/google');
  assert.equal(res.status, 303);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  assert.equal((await codec.read('flow', cookie)).state, 'correct-state');
  assert.equal((await request('/auth/google/callback?state=wrong&code=x', { headers: { cookie } })).status, 400);
  assert.equal((await request('/auth/google/callback?state=correct-state&state=other&code=x', { headers: { cookie } })).status, 400);
});

test('successful callback creates short-lived session, clears flow and redirects only to root', async t => {
  const { request, codec } = await fixture(t);
  const flow = await codec.issue('flow', { state: 's', nonce: 'n', codeVerifier: 'v' }, 60);
  const res = await request('/auth/google/callback?state=s&code=code&next=https://evil.example', { headers: { cookie: flow.cookie.split(';')[0] } });
  assert.equal(res.status, 303); assert.equal(res.headers.get('location'), '/');
  const set = res.headers.getSetCookie();
  assert.ok(set.some(cookie => cookie.startsWith('portal_flow=;')));
  const session = set.find(cookie => cookie.startsWith('portal_session='));
  assert.match(session, /Max-Age=900/);
  assert.equal((await codec.read('session', session.split(';')[0])).subject, 'test-sub');
});

test('login token exchange errors never expose credentials', async t => {
  const { request, codec } = await fixture(t, { login: { complete: async () => { throw new Error('CLIENT-SECRET-CANARY'); } } });
  const flow = await codec.issue('flow', { state: 's' }, 60);
  const res = await request('/auth/google/callback?state=s&code=x', { headers: { cookie: flow.cookie.split(';')[0] } });
  assert.equal(res.status, 401); assert.deepEqual(await res.json(), { error: 'GOOGLE_SIGN_IN_FAILED' });
});

test('logout requires matching Origin and per-session CSRF', async t => {
  const { request, codec, config } = await fixture(t);
  const issued = await codec.issue('session', { provider: 'google', subject: 's', csrf: 'csrf-1' }, 60);
  const cookie = issued.cookie.split(';')[0];
  const options = { method: 'POST', headers: { cookie, origin: 'https://evil.example' }, body: 'csrf=csrf-1' };
  assert.equal((await request('/auth/logout', options)).status, 403);
  for(const origin of [undefined,'null']){
    const headers={cookie};if(origin!==undefined)headers.origin=origin;
    const rejected=await request('/auth/logout',{method:'POST',headers,body:'csrf=csrf-1'});
    assert.equal(rejected.status,403);assert.equal(rejected.headers.get('set-cookie'),null);
  }
  options.headers.origin = config.origin; options.body = 'csrf=wrong';
  assert.equal((await request('/auth/logout', options)).status, 403);
  options.body = 'csrf=csrf-1';
  const res = await request('/auth/logout', options);
  assert.equal(res.status, 303); assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
});

test('approved account pages load the logout client while retaining no-referrer and strict server checks',async t=>{
 let role='admin';
 const store={table:async name=>name==='identities'?[{provider:'google',provider_subject:'test-sub',legacy_user_id:'u1',status:'active',approved_by:'a',approved_at:'x'}]:[{id:'u1',role,account_status:'active',hospital_id:'10746'}]};
 const {request,codec}=await fixture(t,{store});
 const issued=await codec.issue('session',{provider:'google',subject:'test-sub',email:'test@example.test',csrf:'test-csrf'},60);
 for(role of ['admin','hospital','reviewer']){
   const response=await request('/',{headers:{cookie:issued.cookie.split(';')[0]}}),html=await response.text();
   assert.equal(response.status,200);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
   assert.match(html,/<script src="\/account\.js" defer><\/script>/);
   assert.match(html,/<form method="post" action="\/auth\/logout">/);
 }
 assert.equal((await request('/account.js')).status,200);
});

test('unlinked user may see own identity only and never reaches assessment table', async t => {
  const tables = [];
  const { request, codec } = await fixture(t, { store: { table: async name => { tables.push(name); return []; } } });
  const token = await codec.issue('session', { provider: 'google', subject: 'new', email: 'new@example.test' }, 60);
  const headers = { cookie: token.cookie.split(';')[0] };
  assert.equal((await (await request('/api/me', { headers })).json()).access.status, 'unlinked');
  assert.equal((await request('/api/assessments?module=mou&hospital_id=09625&fiscal_year=2569', { headers })).status, 403);
  assert.equal((await request('/api/admin/storage-check', { headers })).status, 403);
  assert.ok(tables.every(name => name === 'identities'));
});

test('unsafe Host and private paths are rejected; security headers are applied', async t => {
  const { request, config } = await fixture(t);
  // fetch normalizes Host; use a raw HTTP request to exercise host-header injection.
  const status = await new Promise((resolve, reject) => {
    const req = httpRequest(config.origin, { headers: { host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(status, 400);
  for (const path of ['/.env.local', '/.secrets/google-storage-token.json', '/src/config.js']) assert.equal((await request(path)).status, 404);
  const res = await request('/');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});

test('public deployment adapter remains disabled without release flag', async () => {
  const previous = process.env.ALLOW_PUBLIC_STAGING; delete process.env.ALLOW_PUBLIC_STAGING;
  const result = {};
  try { await vercelHandler({}, { writeHead: status => { result.status = status; }, end: body => { result.body = body; } }); }
  finally { if (previous !== undefined) process.env.ALLOW_PUBLIC_STAGING = previous; }
  assert.equal(result.status, 503); assert.match(result.body, /PUBLIC_STAGING_DISABLED/);
});

test('local UI demo is credential-free, asset allowlisted, and cannot send data', async t=>{
 const {request,config}=await fixture(t,{store:{table:()=>assert.fail('Demo must not read Sheets')}});
 for(const path of ['/demo/dashboard','/demo/mou']){
  const res=await request(path);assert.equal(res.status,200);
  assert.match(res.headers.get('content-security-policy'),/connect-src 'none'; form-action 'none'/);
  assert.match(await res.text(),/data-base="\/demo"/);
  assert.equal((await request(path,{method:'POST'})).status,405);
 }
 for(const path of ['/workspace.css','/workspace.js','/demo-model.js'])assert.equal((await request(path)).status,200);
 for(const path of ['/public/workspace.js','/src/workspace-page.js','/demo/config.js'])assert.equal((await request(path)).status,404);
 config.local=false;
 assert.equal((await request('/demo/dashboard')).status,404);
 assert.equal((await request('/demo/mou')).status,404);
});

test('account workspaces require login and approval; never read assessment tables',async t=>{
 const {request,codec}=await fixture(t);
 for(const path of ['/dashboard','/mou']){
  const unauth=await request(path);assert.equal(unauth.status,303);assert.equal(unauth.headers.get('location'),'/');
  const token=await codec.issue('session',{provider:'google',subject:'new'},60);
  assert.equal((await request(path,{headers:{cookie:token.cookie.split(';')[0]}})).status,403);
 }
});

test('approved account opens actual read-only workspace with honest empty state and no fixture script',async t=>{
 const store={directory:async()=>[],table:async name=>{
  if(name==='identities')return [{provider:'google',provider_subject:'test-sub',legacy_user_id:'u1',status:'active',approved_by:'a',approved_at:'2026-09-04'}];
  if(name==='users')return [{id:'u1',role:'admin',account_status:'active'}];
  if(['mou_categories','mou_items','mou_settings','mou_agencies'].includes(name))return [];
  assert.fail('No assessment read without a selected unit');
 }};
 const {request,codec}=await fixture(t,{store});
 const token=await codec.issue('session',{provider:'google',subject:'test-sub',email:'private-canary@example.test'},60);
 const headers={cookie:token.cookie.split(';')[0]};
 for(const path of ['/dashboard','/mou']){
  const res=await request(path,{headers});assert.equal(res.status,200);
  const html=await res.text();assert.ok(!html.includes('workspace.js'));assert.ok(!html.includes('private-canary'));assert.match(html,/รอนำเข้าข้อมูลต้นทาง/);
  assert.ok(!html.includes('DEMO-PCU'));assert.match(res.headers.get('content-security-policy'),/default-src 'none'/);
 }
 assert.match(await (await request('/',{headers})).text(),/public-landing/);
 assert.match(await (await request('/account',{headers})).text(),/href="\/dashboard"/);
});

test('real workspace returns safe error page for Google failure instead of zero or synthetic results',async t=>{
 const store={directory:async()=>{throw Error('PRIVATE-CANARY');},table:async name=>name==='identities'?[{provider:'google',provider_subject:'test-sub',legacy_user_id:'u1',status:'active',approved_by:'a',approved_at:'2026-09-04'}]:name==='users'?[{id:'u1',role:'admin',account_status:'active'}]:[]};
 const {request,codec}=await fixture(t,{store});
 const token=await codec.issue('session',{provider:'google',subject:'test-sub'},60);
 const res=await request('/dashboard',{headers:{cookie:token.cookie.split(';')[0]}});
 assert.equal(res.status,503);const html=await res.text();assert.match(html,/ยังอ่านข้อมูลจาก Sheets ไม่สำเร็จ/);assert.ok(!html.includes('PRIVATE-CANARY'));assert.ok(!html.includes('DEMO-PCU'));
});

test('read-only workspaces reject duplicate parameters and mutations',async t=>{
 const {request,codec}=await fixture(t,{store:{table:async name=>name==='identities'?[{provider:'google',provider_subject:'test-sub',legacy_user_id:'u1',status:'active',approved_by:'a',approved_at:'x'}]:[{id:'u1',role:'hospital',hospital_id:'09625',account_status:'active'}],directory:()=>assert.fail('No unauthorized read')}});
 const token=await codec.issue('session',{provider:'google',subject:'test-sub'},60),headers={cookie:token.cookie.split(';')[0]};
 for(const route of ['/dashboard','/mou']){
  assert.equal((await request(route+'?year=2569&year=2570',{headers})).status,400);
  assert.equal((await request(route+'?hospital_id=09626',{headers})).status,403);
  for(const method of ['POST','PUT','DELETE'])assert.equal((await request(route,{headers,method})).status,405);
 }
});

