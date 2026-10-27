import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
import {PortalError} from '../src/errors.js';
import gateway from '../api/index.js';
const browser={accept:'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'};
async function fixture(t,{store={table:async()=>[]},login,handler}={}){
 const config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake',GOOGLE_LOGIN_CLIENT_ID:'fake',GOOGLE_LOGIN_CLIENT_SECRET:'fake'}),codec=sessionCodec(config),server=createServer(handler||createApp(config,{codec,store,...(login?{login}:{})}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close();});return {config,codec,get:(path,headers=browser)=>fetch(config.origin+path,{headers,redirect:'manual'})};
}
test('browser missing page is Thai HTML with safe links while API and explicit JSON stay JSON',async t=>{
 const f=await fixture(t),res=await f.get('/not-a-page?token=PRIVATE_CANARY');assert.equal(res.status,404);assert.match(res.headers.get('content-type'),/text\/html/);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('referrer-policy'),'no-referrer');assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);const html=await res.text();assert.match(html,/ไม่พบหน้าที่ต้องการ/);assert.match(html,/href="\/"/);assert.ok(!html.includes('PRIVATE_CANARY'));assert.ok(!html.includes('/not-a-page'));
 for(const [path,headers] of [['/api/missing',browser],['/api',browser],['/missing',{accept:'application/json'}],['/missing',{accept:'text/html;q=0,application/json'}]]){const response=await f.get(path,headers);assert.equal(response.status,404);assert.match(response.headers.get('content-type'),/application\/json/);assert.deepEqual(await response.json(),{error:'NOT_FOUND'});}
});
test('browser permission errors keep 403 and offer account help without reading an unauthorized page',async t=>{
 const f=await fixture(t),cookie=(await f.codec.issue('session',{provider:'google',subject:'unlinked',email:'PRIVATE_MAIL',csrf:'x'},900)).cookie.split(';')[0];const res=await f.get('/admin/registrations',{...browser,cookie});assert.equal(res.status,403);assert.match(res.headers.get('content-type'),/text\/html/);const html=await res.text();assert.match(html,/ยังไม่มีสิทธิ์เปิดหน้านี้/);assert.match(html,/href="\/account"/);assert.ok(!html.includes('PRIVATE_MAIL'));
});
test('provider failures and quotas render safe HTML and bounded retry guidance',async t=>{
 for(const quota of [false,true]){const error=quota?Object.assign(new PortalError('GOOGLE_QUOTA_EXCEEDED',503),{retryAfter:60}):Error('PRIVATE_STACK token=PRIVATE_SECRET');const f=await fixture(t,{store:{table:async()=>{throw error;}}}),cookie=(await f.codec.issue('session',{provider:'google',subject:'x'},900)).cookie.split(';')[0];const res=await f.get('/files',{...browser,cookie});assert.equal(res.status,503);const html=await res.text();assert.match(res.headers.get('content-type'),/text\/html/);assert.ok(!html.includes('PRIVATE_'));assert.match(html,/กลับหน้าหลัก/);if(quota){assert.equal(res.headers.get('retry-after'),'60');assert.match(html,/60/);assert.match(html,/data-retry-after="60"/);}else assert.match(html,/บริการยังไม่พร้อมใช้งาน/);}
});
test('OAuth errors get a login recovery page without callback data or a retry callback button',async t=>{
 const f=await fixture(t);const res=await f.get('/auth/google/callback?code=PRIVATE_AUTH_CODE&state=PRIVATE_STATE');assert.equal(res.status,400);assert.match(res.headers.get('content-type'),/text\/html/);const html=await res.text();assert.match(html,/เข้าสู่ระบบอีกครั้ง/);assert.ok(!html.includes('PRIVATE_'));assert.ok(!html.includes('data-error-retry'));
});
test('mutation requests always keep JSON even when a browser asks for HTML',async t=>{
 const f=await fixture(t);const res=await fetch(f.config.origin+'/api/registration',{method:'POST',headers:{...browser,origin:f.config.origin,'Content-Type':'application/json'},body:'{}'});assert.match(res.headers.get('content-type'),/application\/json/);assert.ok((await res.json()).error);
});
test('Vercel release gate renders safe browser HTML and keeps API JSON',async t=>{
 const old=process.env.ALLOW_PUBLIC_STAGING;delete process.env.ALLOW_PUBLIC_STAGING;t.after(()=>{if(old===undefined)delete process.env.ALLOW_PUBLIC_STAGING;else process.env.ALLOW_PUBLIC_STAGING=old;});const f=await fixture(t,{handler:gateway}),res=await f.get('/');assert.equal(res.status,503);assert.match(res.headers.get('content-type'),/text\/html/);assert.match(await res.text(),/บริการยังไม่พร้อมใช้งาน/);const api=await f.get('/api/health');assert.deepEqual(await api.json(),{error:'PUBLIC_STAGING_DISABLED'});
});

test('Vercel invalid configuration also has a safe HTML fallback without leaking config',async t=>{
 const oldFlag=process.env.ALLOW_PUBLIC_STAGING,oldOrigin=process.env.APP_ORIGIN;process.env.ALLOW_PUBLIC_STAGING='1';process.env.APP_ORIGIN='PRIVATE_INVALID_ORIGIN';t.after(()=>{if(oldFlag===undefined)delete process.env.ALLOW_PUBLIC_STAGING;else process.env.ALLOW_PUBLIC_STAGING=oldFlag;if(oldOrigin===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=oldOrigin;});const f=await fixture(t,{handler:gateway}),response=await f.get('/');assert.equal(response.status,503);assert.match(response.headers.get('content-type'),/text\/html/);const html=await response.text();assert.ok(!html.includes('PRIVATE_INVALID_ORIGIN'));assert.ok(!html.includes('data-error-retry'));const api=await f.get('/api/health');assert.deepEqual(await api.json(),{error:'CONFIGURATION_REQUIRED'});
});
import {createHash} from 'node:crypto';
test('inline error styles match the CSP hash, HEAD has no body and rejected media type stays JSON',async t=>{
 const f=await fixture(t),res=await f.get('/missing'),html=await res.text(),style=html.match(/<style>([\s\S]*?)<\/style>/)[1],hash=createHash('sha256').update(style).digest('base64');assert.ok(!style.includes('\r'),'HTML parser normalizes CRLF before checking the style hash');assert.ok(res.headers.get('content-security-policy').includes("'sha256-"+hash+"'"));assert.ok(!res.headers.get('content-security-policy').includes('unsafe-inline'));
 const head=await fetch(f.config.origin+'/missing',{method:'HEAD',headers:browser});assert.equal(head.status,405);assert.match(head.headers.get('content-type'),/text\/html/);assert.equal(await head.text(),'');
});
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('retry countdown never navigates automatically and only enables a deliberate GET reload after the wait',()=>{
 let now=0,reloads=0,interval,click;const button={dataset:{retryAfter:'2'},disabled:true,addEventListener:(type,fn)=>{if(type==='click')click=fn;},textContent:''},note={textContent:''};
 const context={document:{querySelector:s=>s==='[data-error-retry]'?button:note},Date:{now:()=>now},location:{reload:()=>reloads++},setInterval:fn=>{interval=fn;return 1;},clearInterval:()=>{}};
 vm.runInNewContext(readFileSync(new URL('../public/portal-error.js',import.meta.url),'utf8'),context);assert.equal(button.disabled,true);click();assert.equal(reloads,0);now=1000;interval();assert.equal(button.disabled,true);now=2000;interval();assert.equal(button.disabled,false);assert.equal(reloads,0);click();assert.equal(reloads,1);assert.equal(button.disabled,true);
});
