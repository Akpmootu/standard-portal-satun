import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {securityEvents} from '../src/security-events.js';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
import {reviewerFixture} from './fixtures/mou-write-data.js';
import {randomUUID} from 'node:crypto';
import gateway from '../api/index.js';

test('security events allow only fixed fields and pseudonymize actors without leaking hostile input',()=>{
 const logs=[],security=securityEvents({secret:'a'.repeat(64),sink:r=>logs.push(r),now:()=>0});
 const input={code:'INVALID_CSRF',status:403,method:'POST',path:'/api/mou/write?token=PRIVATE_QUERY',requestId:'PRIVATE_HEADER',identity:{provider:'google',subject:'PRIVATE_SUBJECT',email:'PRIVATE_EMAIL'},body:'PRIVATE_BODY',error:Error('PRIVATE_STACK')};
 security.record(input);security.record({...input,path:'/api/mou/write',requestId:'11111111-1111-4111-8111-111111111111'});
 assert.equal(logs.length,2);assert.ok(!JSON.stringify(logs).includes('PRIVATE_'));assert.equal(logs[0].route,'other');assert.equal(logs[1].route,'mou_write');assert.match(logs[0].actor,/^[a-f0-9]{24}$/);assert.equal(logs[0].actor,logs[1].actor);assert.notEqual(logs[0].requestId,input.requestId);
 assert.deepEqual(Object.keys(logs[0]).sort(),['actor','code','event','method','requestId','route','severity','status','timestamp'].sort());
 const other=[];securityEvents({secret:'b'.repeat(64),sink:r=>other.push(r)}).record(input);assert.notEqual(other[0].actor,logs[0].actor);
 const anon=[];securityEvents({sink:r=>anon.push(r)}).record(input);assert.equal(anon[0].actor,'anonymous');
 security.record({...input,code:'PRIVATE_CODE',method:'PRIVATE_METHOD',status:503});assert.equal(logs.at(-2).code,'SERVICE_FAILURE');assert.equal(logs.at(-2).method,'OTHER');
});

test('access changes alert once on committed approval, not replay, and cross-unit reads are denied',async t=>{
 const records=[],data=reviewerFixture(),config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake'}),codec=sessionCodec(config);config.writer={enabled:true,url:'fixture',secret:'fixture'};
 let writes=0;const server=createServer(createApp(config,{codec,securityLog:r=>records.push(r),store:{table:async n=>data[n]||[]},writer:{execute:async(_identity,c)=>{writes++;return {ok:true,replayed:writes>1,requestId:c.requestId};}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close();});
 const cookie=async sub=>(await codec.issue('session',{provider:'google',subject:sub,csrf:'PRIVATE_CSRF'},900)).cookie.split(';')[0];
 const command={csrf:'PRIVATE_CSRF',requestId:randomUUID(),action:'approve',registrationId:'reg-'+randomUUID(),expectedVersion:1,role:'hospital',hospitalId:'09625',hospitalIds:[],fiscalYears:[],note:''};
 const post=async()=>fetch(config.origin+'/api/registration',{method:'POST',headers:{cookie:await cookie('admin-sub'),origin:config.origin,'content-type':'application/json'},body:JSON.stringify(command)});
 assert.equal((await post()).status,200);assert.equal((await post()).status,200);assert.equal(records.filter(r=>r.code==='ACCESS_CHANGED'&&r.event==='portal_security_event').length,1);assert.equal(records.filter(r=>r.event==='portal_security_alert').length,1);
 const denied=await fetch(config.origin+'/api/assessments?module=ctam&hospital_id=10746',{headers:{cookie:await cookie('hospital-sub')}});assert.equal(denied.status,403);assert.equal(records.at(-1).code,'HOSPITAL_ACCESS_DENIED');assert.ok(!JSON.stringify(records).includes('10746'));
});

test('unknown response errors are normalized and ordinary validation errors are not security incidents',()=>{
 const records=[],s=securityEvents({sink:r=>records.push(r)});s.record({status:400,code:'PRIVATE_VALIDATION'});s.record({status:404,code:'NOT_FOUND'});s.record({status:405,code:'WRITES_DISABLED'});assert.equal(records.length,0);
 s.record({status:403,code:'PRIVATE_DENIAL',path:'/files/PRIVATE_ID'});assert.equal(records[0].code,'ACCESS_DENIED');assert.equal(records[0].route,'other');
});

test('configuration gate emits a safe correlated service alert even before the app can initialize',async t=>{
 const previous=process.env.ALLOW_PUBLIC_STAGING,originalInfo=console.info,originalWarn=console.warn,records=[];delete process.env.ALLOW_PUBLIC_STAGING;
 console.info=console.warn=line=>{try{records.push(JSON.parse(line));}catch{}};
 t.after(()=>{console.info=originalInfo;console.warn=originalWarn;if(previous===undefined)delete process.env.ALLOW_PUBLIC_STAGING;else process.env.ALLOW_PUBLIC_STAGING=previous;});
 const server=createServer(gateway);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/health?token=PRIVATE_QUERY');assert.equal(response.status,503);assert.equal(records[0].code,'PUBLIC_STAGING_DISABLED');assert.equal(records[0].requestId,response.headers.get('x-portal-request-id'));assert.equal(records[1].event,'portal_security_alert');assert.ok(!JSON.stringify(records).includes('PRIVATE_'));
});

test('security alerts enforce thresholds, cooldown and bounded logging without losing alert counters',()=>{
 let now=0;const logs=[],s=securityEvents({sink:r=>logs.push(r),now:()=>now});const event={code:'INVALID_CSRF',status:403,method:'POST',path:'/api/mou/write'};
 for(let i=0;i<4;i++)s.record(event);assert.equal(logs.filter(r=>r.event==='portal_security_alert').length,0);s.record(event);assert.equal(logs.at(-1).count,5);
 for(let i=0;i<1000;i++)s.record(event);assert.equal(logs.filter(r=>r.event==='portal_security_event').length,60);assert.equal(logs.filter(r=>r.event==='portal_security_alert').length,1);
 now=60001;s.record(event);assert.equal(logs.find(r=>r.event==='portal_security_suppressed').count,945);
 now=300001;for(let i=0;i<5;i++)s.record(event);assert.equal(logs.filter(r=>r.event==='portal_security_alert').length,2);
 s.record({code:'GOOGLE_QUOTA_EXCEEDED',status:503,path:'/files',method:'GET'});assert.equal(logs.at(-1).category,'service');
});

test('security sink failures never escape or retry business operations',async()=>{
 const s=securityEvents({sink:()=>{throw Error('PRIVATE_SINK');}});assert.doesNotThrow(()=>s.record({code:'INVALID_CSRF',status:403}));
 const asyncSink=securityEvents({sink:async()=>{throw Error('PRIVATE_ASYNC');}});assert.doesNotThrow(()=>asyncSink.record({code:'SERVICE_FAILURE',status:503}));await new Promise(r=>setImmediate(r));
});

test('successful login and logout are correlated and never serialize identity or cookie',async t=>{
 const records=[],config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_LOGIN_CLIENT_ID:'fake',GOOGLE_LOGIN_CLIENT_SECRET:'fake'}),codec=sessionCodec(config),identity={provider:'google',subject:'PRIVATE_SUBJECT',email:'PRIVATE_EMAIL'};
 const server=createServer(createApp(config,{codec,securityLog:r=>records.push(r),store:{table:async()=>[]},login:{complete:async()=>identity}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close();});
 const flow=(await codec.issue('flow',{state:'PRIVATE_STATE'},600)).cookie.split(';')[0];const response=await fetch(config.origin+'/auth/google/callback?code=PRIVATE_CODE&state=PRIVATE_STATE',{headers:{cookie:flow},redirect:'manual'});assert.equal(response.status,303);assert.equal(records.at(-1).code,'LOGIN_SUCCEEDED');
 const session=(await codec.issue('session',{...identity,csrf:'PRIVATE_CSRF'},900)).cookie.split(';')[0];const logout=await fetch(config.origin+'/auth/logout',{method:'POST',headers:{cookie:session,origin:config.origin,'content-type':'application/x-www-form-urlencoded'},body:'csrf=PRIVATE_CSRF',redirect:'manual'});assert.equal(logout.status,303);assert.equal(records.at(-1).code,'LOGOUT_SUCCEEDED');assert.equal(records[0].actor,records[1].actor);assert.equal(records.filter(r=>r.event==='portal_security_alert').length,0);assert.ok(!JSON.stringify(records).includes('PRIVATE_'));
});

test('real HTTP failures carry server correlation and safe events while normal reads stay quiet',async t=>{
 const records=[],config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),MOU_WRITES_ENABLED:'1',MOU_WRITER_URL:'https://script.google.com/macros/s/aaaaaaaaaaaaaaaaaaaa/exec',MOU_WRITER_SECRET:'a'.repeat(64),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake',GOOGLE_LOGIN_CLIENT_ID:'fake',GOOGLE_LOGIN_CLIENT_SECRET:'fake'}),codec=sessionCodec(config);
 let writes=0;const server=createServer(createApp(config,{codec,securityLog:r=>records.push(r),store:{table:async()=>{throw Error('PRIVATE_PROVIDER');}},writer:{execute:async()=>{writes++;}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close();});
 const cookie=(await codec.issue('session',{provider:'google',subject:'PRIVATE_SUBJECT',email:'PRIVATE_EMAIL',csrf:'PRIVATE_CSRF'},900)).cookie.split(';')[0];
 const res=await fetch(config.origin+'/api/mou/write?secret=PRIVATE_QUERY',{method:'POST',headers:{cookie,origin:config.origin,'content-type':'application/json','x-request-id':'PRIVATE_HEADER'},body:JSON.stringify({csrf:'WRONG',note:'PRIVATE_BODY'})});assert.equal(res.status,403);assert.deepEqual(await res.json(),{error:'INVALID_CSRF'});assert.equal(writes,0);assert.equal(records[0].code,'INVALID_CSRF');assert.equal(res.headers.get('x-portal-request-id'),records[0].requestId);assert.equal(records[0].route,'mou_write');
 const outage=await fetch(config.origin+'/files',{headers:{cookie}});assert.equal(outage.status,503);assert.equal(records.at(-1).event,'portal_security_alert');
 const oauth=await fetch(config.origin+'/auth/google/callback?code=PRIVATE_CODE&state=PRIVATE_STATE',{redirect:'manual'});assert.equal(oauth.status,400);assert.ok(records.some(r=>r.code==='INVALID_OAUTH_STATE'));
 const before=records.length;assert.equal((await fetch(config.origin+'/api/health')).status,200);assert.equal(records.length,before);assert.ok(!JSON.stringify(records).includes('PRIVATE_'));
});

