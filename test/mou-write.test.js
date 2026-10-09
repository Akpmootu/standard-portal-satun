import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createServer} from 'node:http';
import schema from '../src/schema.json' with {type:'json'};
import {WRITE_TABLES,WRITE_LOG_HEADERS,normalizeMouCommand,planMouWrite,bangkokTimestamp} from '../src/mou-write-rules.js';
import {mouWriterClient} from '../src/mou-writer-client.js';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
const now=new Date('2026-09-07T00:00:00Z'),hash=c=>createHash('sha256').update(JSON.stringify(normalizeMouCommand(c))).digest('hex');
const identity={provider:'google',subject:'hospital-sub'},admin={provider:'google',subject:'admin-sub'};
import {writeFixture,reviewerFixture} from './fixtures/mou-write-data.js';

function save(overrides={}){return {requestId:randomUUID(),action:'save',hospitalId:'09625',itemId:'1',fiscalYear:2569,expectedVersion:1,status:'completed',detail:'ปรับปรุงแล้ว',evidenceLink:'',...overrides};}
function review(overrides={}){return {requestId:randomUUID(),action:'review',hospitalId:'09625',itemId:'1',fiscalYear:2569,expectedVersion:1,reviewStatus:'approved',comment:'',...overrides};}
function commit(t,p){t.mou_progress=t.mou_progress.filter(r=>r.id!==p.next.id).concat([p.next]);if(p.history)t.mou_review_history.push(p.history);t.audit_log.push(p.audit);t.write_requests.push(p.receipt);}
test('hospital edit resets latest review while admin edit preserves it and evidence',()=>{
 const t=writeFixture(),c=save(),original=JSON.stringify(t);let p=planMouWrite(t,identity,c,hash(c),now);
 assert.equal(p.next.admin_status,'pending');for(const k of ['admin_comment','admin_reviewed_at','admin_reviewed_by'])assert.equal(p.next[k],'');
 assert.equal(p.next.evidence_link,t.mou_progress[0].evidence_link);assert.equal(p.next._version,2);assert.equal(p.history,null);assert.equal(JSON.stringify(t),original);
 p=planMouWrite(t,admin,c,hash(c),now);assert.equal(p.next.admin_status,'rejected');assert.equal(p.next.admin_reviewed_by,'legacy:ผู้ตรวจ');
 assert.equal(p.next.updated_by,'u2');assert.equal(bangkokTimestamp(now),'2026-09-07 07:00:00');
});
test('review has one linked history, bound actor audit, and rejection requires comment',()=>{
 const t=writeFixture(),c=review(),p=planMouWrite(t,admin,c,hash(c),now);
 assert.equal(p.next.admin_status,'approved');assert.equal(p.history.progress_id,p.next.id);assert.equal(p.history.admin_reviewed_by,'ผู้ตรวจทดสอบ');assert.equal(p.audit.actor_id,'u2');assert.equal(p.next.updated_at,t.mou_progress[0].updated_at);
 assert.throws(()=>normalizeMouCommand(review({reviewStatus:'rejected'})),/REQUIRED_WRITE_FIELD/);
 assert.throws(()=>normalizeMouCommand(review({reviewerName:'ปลอมชื่อ'})),/INVALID_WRITE_COMMAND/);
 assert.throws(()=>planMouWrite(t,identity,c,hash(c),now),/ADMIN_REQUIRED/);
});
test('version conflicts and idempotent retries also work after later edits',()=>{
 const t=writeFixture(),c=save(),p=planMouWrite(t,identity,c,hash(c),now);commit(t,p);
 assert.throws(()=>planMouWrite(t,identity,save(),hash(save()),now),/VERSION_CONFLICT/);
 const c2=review({expectedVersion:2});commit(t,planMouWrite(t,admin,c2,hash(c2),now));
 assert.equal(t.mou_progress[0]._version,3);
 const replay=planMouWrite(t,identity,c,hash(c),now);assert.equal(replay.replayed,true);assert.equal(replay.result.version,2);assert.equal(t.audit_log.length,2);
 const changed={...c,detail:'changed'};assert.throws(()=>planMouWrite(t,identity,changed,hash(changed),now),/REQUEST_ID_REUSED/);
 t.users[0].account_status='disabled';assert.throws(()=>planMouWrite(t,identity,c,hash(c),now),/ACCOUNT_DISABLED/);
});
test('create, missing data, unsafe URLs and unexpected fields fail precisely',()=>{
 const t=writeFixture();t.mou_progress=[];const c=save({expectedVersion:0,evidenceLink:'https://example.org/new'}),p=planMouWrite(t,identity,c,hash(c),now);assert.equal(p.next.id,'mou-'+c.requestId);assert.equal(p.next._version,1);
 for(const link of ['javascript:alert(1)','https://user:pass@example.org/','https://example.org\\@evil.test/','https://evil.test\n'])assert.throws(()=>normalizeMouCommand(save({evidenceLink:link==='https://evil.test\n'?'https://evil.test/\npath':link})),/INVALID_EVIDENCE_LINK/);
 assert.throws(()=>normalizeMouCommand(save({role:'admin'})),/INVALID_WRITE_COMMAND/);
 assert.throws(()=>planMouWrite(t,identity,save({expectedVersion:0}),hash(save()),now),/EVIDENCE_REQUIRED/);
 assert.throws(()=>planMouWrite(t,identity,save({expectedVersion:0,detail:''}),hash(save()),now),/ASSESSMENT_DETAIL_REQUIRED/);
});
test('period/year/group locks use server data, admin bypass matches legacy',()=>{
 const t=writeFixture(),c=save();t.mou_settings[1].setting_value='0';assert.throws(()=>planMouWrite(t,identity,c,hash(c),now),/ASSESSMENT_LOCKED/);
 assert.equal(planMouWrite(t,admin,c,hash(c),now).next._version,2);
 t.mou_settings[1].setting_value='1';assert.throws(()=>planMouWrite(t,identity,c,hash(c),new Date('2026-09-30T17:00:00Z')),/ASSESSMENT_LOCKED/);
 t.mou_items[0].item_number='3.1';assert.throws(()=>planMouWrite(t,identity,c,hash(c),now),/ASSESSMENT_LOCKED/);
 t.mou_agencies[0].status='pending';assert.throws(()=>planMouWrite(t,admin,c,hash(c),now),/AGENCY_NOT_CONFIRMED/);
 t.users[0].hospital_id='09626';assert.throws(()=>planMouWrite(t,identity,c,hash(c),now),/HOSPITAL_ACCESS_DENIED/);
});
test('writer client signs exact command and follows only safe result redirect without POST',async()=>{
 const calls=[],secret='a'.repeat(64),c=save();
 const client=mouWriterClient({writer:{enabled:true,url:'https://script.google.com/macros/s/test/exec',secret}},async(url,opts)=>{
   calls.push({url,opts});if(calls.length===1)return {status:302,headers:new Headers({location:'https://script.googleusercontent.com/result'})};
   return new Response(JSON.stringify({ok:true,requestId:c.requestId,recordId:'p1',version:2,replayed:false}));
 });
 assert.equal((await client.execute(identity,c)).version,2);
 const envelope=JSON.parse(calls[0].opts.body);assert.equal(envelope.signature,createHmac('sha256',secret).update(envelope.payload).digest('hex'));
 assert.equal(calls[1].opts.method,'GET');assert.equal(calls[1].opts.body,undefined);assert.equal(calls[1].opts.headers,undefined);
 const evil=mouWriterClient({writer:{enabled:true,url:'x',secret}},async()=>({status:302,headers:new Headers({location:'https://evil.test/'})}));
 await assert.rejects(evil.execute(identity,c),/INVALID_WRITER_REDIRECT/);
 const broken=mouWriterClient({writer:{enabled:true,url:'x',secret}},async()=>{throw Error('PRIVATE-SECRET');});await assert.rejects(broken.execute(identity,c),/WRITE_RESULT_UNKNOWN/);
});

function gasFixture(){
 const data=reviewerFixture(),headers={...Object.fromEntries(Object.entries(schema).map(([n,v])=>[n,v.headers])),...WRITE_LOG_HEADERS};
 const grids={},ids={},props=new Map([['MOU_WRITER_SECRET','a'.repeat(64)],['MOU_SHEET_ID','1dWXmgRRg1yP39OSxl2PmFarlH1xAi1gaKy-rJc4Ve7k'],['MOU_WRITES_ENABLED','1']]);
 const runtimeTables=[...WRITE_TABLES,'announcements','notifications','rg12_comments','rg12_chapters','files'];
 runtimeTables.forEach((n,i)=>{ids[n]=i+1;grids[n]=[headers[n],...(data[n]||[]).map(r=>headers[n].map(h=>r[h]??''))];});
 let held=false,blocked=false,batches=0,failCommit=false;
 class FixtureDate extends Date {
  constructor(...args){super(...(args.length?args:[now.getTime()]));}
  static now(){return now.getTime();}
 }
 const context=vm.createContext({Date:FixtureDate,Intl,URL,Set,Map,JSON,Number,Object,String,Math,Error,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},
  LockService:{getScriptLock:()=>({tryLock:()=>{if(blocked||held)return false;held=true;return true;},hasLock:()=>held,releaseLock:()=>{held=false;}})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})},
  Utilities:{Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(alg,s)=>Array.from(createHash('sha256').update(s).digest()),computeHmacSha256Signature:(s,k)=>Array.from(createHmac('sha256',k).update(s).digest())},
  Sheets:{Spreadsheets:{
    get:()=>({sheets:runtimeTables.map(n=>({properties:{sheetId:ids[n],title:n,gridProperties:{rowCount:Math.max(100,grids[n].length),columnCount:26}}}))}),
    Values:{batchGet:(id,opts)=>({valueRanges:opts.ranges.map(range=>({values:structuredClone(grids[range.split("'")[1]])}))})},
    batchUpdate:body=>{assert.equal(held,true);batches++;if(failCommit)throw Error('UPSTREAM-SECRET');
      for(const req of body.requests){if(!req.updateCells)continue;const u=req.updateCells,n=Object.keys(ids).find(n=>ids[n]===u.range.sheetId);
        grids[n][u.range.startRowIndex]=u.rows[0].values.map(c=>c.userEnteredValue.stringValue??c.userEnteredValue.numberValue);
      }return {};},
  }},
 });
 vm.runInContext(readFileSync(new URL('../apps-script/build/Writer.gs',import.meta.url),'utf8'),context);
 const post=(c,who=identity,timestamp=now.getTime(),bad=false,operation)=>{const payload=JSON.stringify({v:2,audience:'standard-portal-mou-writer',timestamp,identity:who,command:c,...(operation?{operation}:{})});return JSON.parse(context.doPost({postData:{contents:JSON.stringify({payload,signature:bad?'0'.repeat(64):createHmac('sha256','a'.repeat(64)).update(payload).digest('hex')})}}));};
 return {post,props,grids,context,get batches(){return batches;},get held(){return held;},set blocked(v){blocked=v;},set failCommit(v){failCommit=v;}};
}
test('bundled Apps Script writes all records in one batch, literal text, and rejects stale second writer',()=>{
 const g=gasFixture(),c=save({detail:'=IMPORTXML("https://evil.test")'});let r=g.post(c);assert.equal(r.ok,true);assert.equal(g.batches,1);assert.equal(g.held,false);
 assert.equal(g.grids.mou_progress[1][5],c.detail);assert.equal(g.grids.audit_log.length,2);assert.equal(g.grids.write_requests.length,2);
 assert.equal(g.post(c).replayed,true);assert.equal(g.batches,1);
 assert.equal(g.post(save()).error,'VERSION_CONFLICT');assert.equal(g.batches,1);
 r=g.post(review({expectedVersion:2}),admin);assert.equal(r.ok,true);assert.equal(g.grids.mou_review_history.length,2);assert.equal(g.grids.audit_log.length,3);
});
test('bundle rejects signatures, expiry, disabled writer and lock contention before commit',()=>{
 const g=gasFixture(),c=save();assert.equal(g.post(c,identity,now.getTime(),true).error,'INVALID_SIGNATURE');assert.equal(g.post(c,identity,now.getTime()-130000).error,'REQUEST_EXPIRED');
 g.blocked=true;assert.equal(g.post(c).error,'WRITER_BUSY');g.blocked=false;g.props.set('MOU_WRITES_ENABLED','0');assert.equal(g.post(c).error,'WRITES_DISABLED');assert.equal(g.batches,0);
});
test('unknown Sheets commit closes persistent gate and returns no upstream data',()=>{
 const g=gasFixture();g.failCommit=true;const r=g.post(save());assert.equal(r.error,'COMMIT_UNCERTAIN');assert.equal(g.props.get('MOU_WRITES_ENABLED'),'0');assert.equal(g.held,false);
 assert.equal(g.post(save()).error,'WRITES_DISABLED');assert.equal(g.batches,1);assert.ok(!JSON.stringify(r).includes('SECRET'));
});
test('HTTP writes require feature gate, identity, Origin, CSRF and current role',async t=>{
 const data=writeFixture();let writes=0;
 const config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake'}),codec=sessionCodec(config);
 const store={table:async n=>structuredClone(data[n]),directory:async()=>[{id:'09625',name:'หน่วยทดสอบ'}]};
 const server=createServer(createApp(config,{codec,store,writer:{execute:async()=>{writes++;return {ok:true};}}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;
 t.after(()=>{server.closeAllConnections();server.close();});
 const issue=await codec.issue('session',{...identity,csrf:'token'},900);
 const req=(body,overrides={})=>fetch(config.origin+'/api/mou/write',{method:'POST',headers:{'Content-Type':'application/json',origin:config.origin,cookie:issue.cookie.split(';')[0],...overrides},body:JSON.stringify(body)});
 let c={...save(),csrf:'token'};
 assert.equal((await req(c)).status,503);config.writer={enabled:true,url:'https://script.google.com/macros/s/test/exec',secret:'a'.repeat(64)};
 assert.equal((await req(c,{origin:'https://evil.test'})).status,403);assert.equal((await req({...c,csrf:'wrong'})).status,403);assert.equal((await req(c,{cookie:''})).status,401);assert.equal(writes,0);
 assert.equal((await req(c)).status,200);assert.equal(writes,1);
 assert.equal((await req({...review(),csrf:'token'})).status,403);
 data.users[0].account_status='disabled';assert.equal((await req(c)).status,403);assert.equal(writes,1);
});


test('bundled writer enforces reviewer scope and approved name under the lock',()=>{
 const g=gasFixture(),who={provider:'google',subject:'reviewer-sub'};
 assert.equal(g.post(review({hospitalId:'09626'}),who).error,'REVIEW_SCOPE_DENIED');
 assert.equal(g.post(save(),who).error,'REVIEWER_SAVE_DENIED');
 assert.equal(g.post(review({reviewerName:'forged'}),who).error,'INVALID_WRITE_COMMAND');
 assert.equal(g.batches,0);
 const c=review(),result=g.post(c,who);assert.equal(result.ok,true);
 assert.equal(g.grids.mou_review_history[1][4],'ผู้ตรวจสมมติที่ได้รับมอบหมาย');
 assert.equal(g.grids.audit_log[1][1],'u3');
 g.grids.reviewer_profiles[2][5]='disabled';
 assert.equal(g.post(c,who).error,'REVIEW_PROFILE_REQUIRED');assert.equal(g.batches,1);
});


test('bundled signup and admin approval each commit one atomic batch; signup grants no access',()=>{
 const g=gasFixture(),applicant={provider:'google',subject:'new-sub',email:'new@example.test'};
 const c={requestId:randomUUID(),action:'register',displayName:'ผู้สมัครสมมติ',jobTitle:'เจ้าหน้าที่',organization:'หน่วยงานสมมติ',phone:'020000000'};
 assert.equal(g.post(c,applicant,now.getTime(),false,'registration').ok,true);assert.equal(g.batches,1);assert.equal(g.grids.users.length,4);assert.equal(g.grids.registration_requests.length,2);
 assert.equal(g.post(c,applicant,now.getTime(),false,'registration').replayed,true);assert.equal(g.batches,1);
 const approve={requestId:randomUUID(),action:'approve',registrationId:'reg-'+c.requestId,expectedVersion:1,role:'reviewer',hospitalId:'',hospitalIds:['09625'],fiscalYears:[2569],note:''};
 assert.equal(g.post(approve,admin,now.getTime(),false,'registration').ok,true);assert.equal(g.batches,2);assert.equal(g.grids.users.length,5);assert.equal(g.grids.identities.length,5);assert.equal(g.grids.reviewer_profiles.length,4);
 assert.equal(g.post(review(),applicant).ok,true);assert.equal(g.grids.mou_review_history[1][4],'ผู้สมัครสมมติ');
});
