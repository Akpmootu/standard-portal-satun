import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {reviewerFixture} from './fixtures/mou-write-data.js';
import {normalizeRegistrationCommand,planRegistration} from '../src/registration-rules.js';
import {resolveAccess} from '../src/authorization.js';
import {validCitizenId,validateThaidClaims,thaidSubject,thaidLogin} from '../src/thaid-login.js';
import {readConfig,readiness} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
import {createApp} from '../src/app.js';
import {landingPage} from '../src/landing-page.js';
import {registrationPage} from '../src/registration-page.js';
import {securityEvents} from '../src/security-events.js';

const key='a'.repeat(64),pid='1101700203450',now=new Date('2026-09-07T00:00:00Z');
const jwt=claims=>['{"alg":"none"}',JSON.stringify(claims)].map(s=>Buffer.from(s).toString('base64url')).join('.')+'.';
const register=(x={})=>({requestId:randomUUID(),action:'register',displayName:'ผู้สมัคร ไทยดี',jobTitle:'นักวิชาการ',organization:'09625',phone:'0200000000',...x});
const hash=c=>createHash('sha256').update(JSON.stringify(normalizeRegistrationCommand(c))).digest('hex');
function commit(t,p){for(const c of p.changes)t[c.table]=t[c.table].filter(r=>!c.existing||r.id!==c.record.id).concat(c.record);}

test('citizen ID checksum and claim validation fail closed',()=>{
 assert.equal(validCitizenId(pid),true);assert.equal(validCitizenId('1101700203451'),false);assert.equal(validCitizenId('110170020345'),false);assert.equal(validCitizenId(1101700203450),false);
 assert.deepEqual(validateThaidClaims({pid,name:'ทดสอบ  ใจดี'},'cid'),{pid,name:'ทดสอบ ใจดี'});
 assert.deepEqual(validateThaidClaims({id_token:jwt({aud:'cid',exp:2e9,pid,given_name:'ทดสอบ',family_name:'ใจดี'})},'cid',1e12),{pid,name:'ทดสอบ ใจดี'});
 assert.throws(()=>validateThaidClaims({id_token:jwt({aud:'other',pid})},'cid'),/INVALID_THAID_IDENTITY/);
 assert.throws(()=>validateThaidClaims({id_token:jwt({aud:'cid',exp:1,pid})},'cid'),/EXPIRED_THAID_IDENTITY/);
 assert.throws(()=>validateThaidClaims({pid,id_token:jwt({aud:'cid',pid:'3910100012341'})},'cid'),/INVALID_THAID_IDENTITY/);
 assert.throws(()=>validateThaidClaims({name:'x'},'cid'),/INVALID_THAID_IDENTITY/);
});

test('subject is a keyed hash and never contains the citizen ID',()=>{
 const s=thaidSubject(pid,key);assert.match(s,/^[a-f0-9]{64}$/);assert.ok(!s.includes(pid));
 assert.notEqual(s,thaidSubject(pid,'b'.repeat(64)));assert.equal(s,thaidSubject(pid,key));
 assert.throws(()=>thaidSubject(pid,''),/THAID_NOT_CONFIGURED/);
});

test('config requires https ThaID endpoints except a loopback mock during local runs',()=>{
 const base={SESSION_KEY_HEX:key,THAID_CLIENT_ID:'c',THAID_CLIENT_SECRET:'s',THAID_SUBJECT_KEY_HEX:key};
 const local=readConfig({...base,THAID_AUTH_URL:'http://127.0.0.1:3901/a',THAID_TOKEN_URL:'http://127.0.0.1:3901/t'});
 assert.equal(readiness(local).thaidConfigured,true);assert.match(local.thaid.authUrl,/^http:\/\/127/);
 assert.equal(readConfig({...base}).thaid.tokenUrl,'https://imauth.bora.dopa.go.th/api/v2/oauth2/token/');
 assert.throws(()=>readConfig({...base,APP_ORIGIN:'https://portal.example.test',THAID_AUTH_URL:'http://127.0.0.1:3901/a'}),/INVALID_THAID_ENDPOINT/);
 assert.throws(()=>readConfig({...base,THAID_TOKEN_URL:'http://evil.example/t'}),/INVALID_THAID_ENDPOINT/);
 assert.throws(()=>readConfig({...base,THAID_SUBJECT_KEY_HEX:'short'}),/INVALID_THAID_SUBJECT_KEY/);
 assert.equal(readiness(readConfig({SESSION_KEY_HEX:key,THAID_CLIENT_ID:'c',THAID_CLIENT_SECRET:'s'})).thaidConfigured,false);
});

test('token exchange uses client authentication and returns only a hashed subject',async()=>{
 const config=readConfig({SESSION_KEY_HEX:key,THAID_CLIENT_ID:'cid',THAID_CLIENT_SECRET:'sec',THAID_SUBJECT_KEY_HEX:key});let seen;
 const login=thaidLogin(config,async(url,options)=>{seen={url,options};return new Response(JSON.stringify({access_token:'AT',pid,name:'ทดสอบ ใจดี'}),{status:200});});
 const {flow,url}=await login.begin();const u=new URL(url);
 assert.equal(u.searchParams.get('state'),flow.state);assert.equal(u.searchParams.get('redirect_uri'),'http://127.0.0.1:3000/auth/thaid/callback');assert.equal(u.searchParams.get('scope'),'pid name');
 const identity=await login.complete('code-1',flow);
 assert.deepEqual(identity,{provider:'thaid',subject:thaidSubject(pid,key),email:'',name:'ทดสอบ ใจดี'});assert.ok(!JSON.stringify(identity).includes(pid));
 assert.equal(seen.options.headers.Authorization,'Basic '+Buffer.from('cid:sec').toString('base64'));assert.match(seen.options.body,/grant_type=authorization_code&code=code-1/);
 const failing=thaidLogin(config,async()=>new Response('{"error":"invalid_grant"}',{status:400}));
 await assert.rejects(failing.complete('x',flow),/THAID_SIGN_IN_FAILED/);
});

test('ThaID applicants register with a contact e-mail and are approved as a separate account',async()=>{
 const data=reviewerFixture(),who={provider:'thaid',subject:thaidSubject(pid,key),email:'',name:'ผู้สมัคร ไทยดี'},admin={provider:'google',subject:'admin-sub'};
 const missing=register();assert.throws(()=>planRegistration(data,who,missing,hash(missing),now),/REGISTRATION_EMAIL_REQUIRED/);
 assert.throws(()=>normalizeRegistrationCommand(register({contactEmail:'not-an-email'})),/REGISTRATION_EMAIL_REQUIRED/);
 const google=register({contactEmail:'x@example.test'});assert.throws(()=>planRegistration(data,{provider:'google',subject:'g',email:'g@example.test'},google,hash(google),now),/REGISTRATION_EMAIL_REQUIRED/);
 const c=register({contactEmail:'ThaiD.User@Example.test'}),p=planRegistration(data,who,c,hash(c),now);commit(data,p);
 const row=data.registration_requests.at(-1);assert.equal(row.provider,'thaid');assert.equal(row.email,'thaid.user@example.test');assert.ok(!JSON.stringify(data).includes(pid));
 assert.equal((await resolveAccess(who,{table:async n=>data[n]})).status,'unlinked');
 const approve={requestId:randomUUID(),action:'approve',registrationId:p.result.recordId,expectedVersion:1,role:'hospital',hospitalId:'09625',hospitalIds:[],fiscalYears:[],note:''};
 commit(data,planRegistration(data,admin,approve,hash(approve),now));
 assert.equal(data.identities.at(-1).email_verified,'false');
 const access=await resolveAccess(who,{table:async n=>data[n]});assert.equal(access.status,'active');assert.equal(access.user.hospitalId,'09625');
 assert.equal((await resolveAccess({provider:'google',subject:who.subject},{table:async n=>data[n]})).status,'unlinked');
});

test('landing shows the ThaID button only when configured; registration asks ThaID users for e-mail',()=>{
 assert.match(landingPage({loginConfigured:true,thaidConfigured:true}),/href="\/auth\/thaid"[^>]*>.*เข้าสู่ระบบด้วย ThaID/);
 assert.doesNotMatch(landingPage({loginConfigured:true,thaidConfigured:false}),/auth\/thaid/);
 assert.match(landingPage({loginConfigured:true,identity:{provider:'thaid',subject:'s',email:'',name:'ทดสอบ ใจดี'},access:{status:'unlinked'},csrf:'c'}),/ยืนยันตัวตนด้วย ThaID แล้ว/);
 const html=registrationPage({provider:'thaid',subject:'s',email:'',name:'ทดสอบ ใจดี'},[],{csrf:'c',enabled:true,units:[{id:'09625',name:'x',registrations:0}]});
 assert.match(html,/name="contactEmail"/);assert.match(html,/value="ทดสอบ"/);assert.match(html,/value="ใจดี"/);
 assert.doesNotMatch(registrationPage({provider:'google',subject:'s',email:'g@example.test'},[],{csrf:'c',enabled:true,units:[]}),/contactEmail/);
});

test('security events hash ThaID actors separately from Google actors',()=>{
 const records=[],events=securityEvents({secret:key,sink:r=>records.push(r)});
 events.record({code:'LOGIN_SUCCEEDED',status:303,path:'/auth/thaid/callback',identity:{provider:'thaid',subject:'x'}});
 events.record({code:'LOGIN_SUCCEEDED',status:303,path:'/auth/google/callback',identity:{provider:'google',subject:'x'}});
 assert.equal(records[0].route,'oauth_callback');assert.notEqual(records[0].actor,'anonymous');assert.notEqual(records[0].actor,records[1].actor);
});

async function fixture(t,thaid){
 const config=readConfig({SESSION_KEY_HEX:randomBytes(32).toString('hex'),GOOGLE_LOGIN_CLIENT_ID:'f',GOOGLE_LOGIN_CLIENT_SECRET:'f',THAID_CLIENT_ID:'cid',THAID_CLIENT_SECRET:'sec',THAID_SUBJECT_KEY_HEX:key});
 const codec=sessionCodec(config),server=createServer(createApp(config,{codec,store:{table:async()=>[]},thaid}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin=`http://127.0.0.1:${server.address().port}`;
 t.after(()=>{server.closeAllConnections();server.close();});
 return {codec,request:(path,o={})=>fetch(config.origin+path,{redirect:'manual',...o})};
}

test('HTTP ThaID flow binds state, rejects cross-provider flows and issues a session',async t=>{
 const thaid={begin:async()=>({flow:{state:'thaid-state'},url:'https://imauth.bora.dopa.go.th/api/v2/oauth2/auth/?x=1'}),complete:async()=>({provider:'thaid',subject:'f'.repeat(64),email:'',name:'ทดสอบ'})};
 const {codec,request}=await fixture(t,thaid);
 const start=await request('/auth/thaid');assert.equal(start.status,303);assert.match(start.headers.get('location'),/^https:\/\/imauth\.bora\.dopa\.go\.th\//);
 const flow=start.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/auth/thaid/callback?state=wrong&code=c',{headers:{cookie:flow}})).status,400);
 assert.equal((await request('/auth/google/callback?state=thaid-state&code=c',{headers:{cookie:flow}})).status,400);
 const cancelled=await request('/auth/thaid/callback?state=thaid-state&error=access_denied',{headers:{cookie:flow,accept:'application/json'}});
 assert.equal(cancelled.status,400);assert.deepEqual(await cancelled.json(),{error:'THAID_SIGN_IN_CANCELLED'});
 const done=await request('/auth/thaid/callback?state=thaid-state&code=c',{headers:{cookie:flow}});
 assert.equal(done.status,303);assert.equal(done.headers.get('location'),'/');
 const session=done.headers.getSetCookie().find(c=>c.startsWith(codec.name('session')+'=')).split(';')[0];
 assert.equal((await codec.read('session',session)).provider,'thaid');
 const home=await (await request('/',{headers:{cookie:session}})).text();assert.match(home,/ยืนยันตัวตนด้วย ThaID แล้ว/);
});

test('HTTP ThaID failures never leak provider errors',async t=>{
 const {request}=await fixture(t,{begin:async()=>({flow:{state:'s'},url:'https://imauth.bora.dopa.go.th/'}),complete:async()=>{throw new Error('SECRET-CANARY');}});
 const flow=(await request('/auth/thaid')).headers.get('set-cookie').split(';')[0];
 const res=await request('/auth/thaid/callback?state=s&code=c',{headers:{cookie:flow,accept:'application/json'}});
 assert.equal(res.status,401);const text=await res.text();assert.doesNotMatch(text,/CANARY/);assert.match(text,/THAID_SIGN_IN_FAILED/);
});
