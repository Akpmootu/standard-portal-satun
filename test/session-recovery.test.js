import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
import {writeFixture} from './fixtures/mou-write-data.js';
async function fixture(t){
 const config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake',MOU_WRITES_ENABLED:'1',MOU_WRITER_URL:'https://script.google.com/macros/s/abcdefghijklmnopqrstuvwxyz/exec',MOU_WRITER_SECRET:'b'.repeat(64)}),data=writeFixture();
 let now=new Date('2026-10-26T02:00:00Z'),reads=0,writes=0;const codec=sessionCodec(config,()=>now),store={table:async name=>{reads++;return structuredClone(data[name]||[]);},directory:async()=>[{id:'09625',name:'หน่วยบริการสมมติ'}]};
 const server=createServer(createApp(config,{codec,store,writer:{execute:async()=>{writes++;return {ok:true};}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close();});
 const session=async(subject='admin-sub',csrf='old-csrf')=>(await codec.issue('session',{provider:'google',subject,csrf},60)).cookie.split(';')[0];
 const original=await session(),html=await(await fetch(config.origin+'/mou/action?hospital_id=09625&year=2569&item_id=1&action=save',{headers:{cookie:original}})).text();
 const recoveryToken=html.match(/name="portal-session" content="([^"]+)"/)?.[1];
 return {config,data,codec,html,recoveryToken,original,session,setTime:value=>{now=new Date(value);},get reads(){return reads;},get writes(){return writes;},post:(cookie,body,origin=config.origin,path='/api/session/recover')=>fetch(config.origin+path,{method:'POST',headers:{'Content-Type':'application/json',cookie,origin},body:JSON.stringify(body)})};
}
test('old form recovers only from a fresh session of the same Google subject without renewing cookies or reading Sheets',async t=>{
 const f=await fixture(t);assert.ok(f.recoveryToken);assert.match(f.html,/portal-session\.js/);
 f.setTime('2026-10-26T02:01:01Z');assert.equal((await f.post(f.original,{recoveryToken:f.recoveryToken})).status,401);
 const fresh=await f.session('admin-sub','fresh-csrf'),before=f.reads,response=await f.post(fresh,{recoveryToken:f.recoveryToken});
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('set-cookie'),null);
 assert.deepEqual(await response.json(),{ok:true,csrf:'fresh-csrf',expiresAt:Date.parse('2026-10-26T02:02:01Z')});assert.equal(f.reads,before);assert.equal(f.writes,0);
});
test('recovery rejects account changes, forged or expired context, cross-origin and unexpected fields',async t=>{
 const f=await fixture(t);assert.ok(f.recoveryToken);const other=await f.session('hospital-sub','other-csrf');
 const response=await f.post(other,{recoveryToken:f.recoveryToken});assert.equal(response.status,403);assert.deepEqual(await response.json(),{error:'RECOVERY_ACCOUNT_MISMATCH'});
 assert.equal((await f.post(f.original,{recoveryToken:f.recoveryToken},'https://evil.example')).status,403);
 assert.equal((await f.post(f.original,{recoveryToken:f.recoveryToken,subject:'hospital-sub'})).status,400);
 assert.equal((await f.post(f.original,{recoveryToken:f.recoveryToken.slice(0,-2)+'xx'})).status,403);
 const upload=(await f.codec.issue('upload',{provider:'google',subject:'admin-sub'},900)).value;assert.equal((await f.post(f.original,{recoveryToken:upload})).status,403);
 f.setTime('2026-10-26T11:00:01Z');assert.equal((await f.post(await f.session(),{recoveryToken:f.recoveryToken})).status,403);assert.equal(f.writes,0);
});
test('a recovered CSRF never bypasses fresh account revocation on the actual write route',async t=>{
 const f=await fixture(t);assert.ok(f.recoveryToken);const fresh=await f.session('admin-sub','fresh-csrf');assert.equal((await f.post(fresh,{recoveryToken:f.recoveryToken})).status,200);
 f.data.users.find(u=>u.id==='u2').account_status='disabled';
 const response=await f.post(fresh,{csrf:'fresh-csrf',requestId:randomUUID(),action:'save',hospitalId:'09625',fiscalYear:2569,itemId:'1',expectedVersion:1,status:'completed',detail:'ร่างสมมติ',evidenceLink:'https://example.test/evidence'},f.config.origin,'/api/mou/write');
 assert.equal(response.status,403);assert.equal(f.writes,0);
});
