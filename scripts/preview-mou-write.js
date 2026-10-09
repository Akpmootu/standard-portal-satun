import {planRegistration,normalizeRegistrationCommand} from '../src/registration-rules.js';
// Isolated synthetic end-to-end QA. localhost cookies cannot replace the real
// portal's 127.0.0.1 cookies. No .secrets/env loader or Google client is invoked.
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {reviewerFixture} from '../test/fixtures/mou-write-data.js';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
import {planMouWrite,normalizeMouCommand} from '../src/mou-write-rules.js';
const port=3003,config=readConfig({APP_ORIGIN:'http://localhost:'+port,SESSION_KEY_HEX:randomBytes(32).toString('hex'),GOOGLE_STORAGE_CLIENT_ID:'fixture',GOOGLE_STORAGE_CLIENT_SECRET:'fixture',GOOGLE_STORAGE_REFRESH_TOKEN:'fixture'});
config.writer={enabled:true,url:'fixture-only',secret:'fixture-only'};
const tables=reviewerFixture(),codec=sessionCodec(config);
const store={table:async n=>structuredClone(tables[n]||[]),directory:async()=>[{id:'09625',name:'หน่วยบริการสมมติสำหรับทดสอบการบันทึก'}]};
const writer={execute:async(identity,command,operation)=>{
 if(operation==='registration'){const c=normalizeRegistrationCommand(command),p=planRegistration(tables,identity,c,createHash('sha256').update(JSON.stringify(c)).digest('hex'));if(!p.replayed)for(const change of p.changes)tables[change.table]=tables[change.table].filter(r=>!change.existing||r.id!==change.record.id).concat(change.record);return p.result;}
 const normalized=normalizeMouCommand(command),hash=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
 const p=planMouWrite(tables,identity,normalized,hash);
 if(!p.replayed){tables.mou_progress=tables.mou_progress.filter(r=>r.id!==p.next.id).concat(p.next);if(p.history)tables.mou_review_history.push(p.history);tables.audit_log.push(p.audit);tables.write_requests.push(p.receipt);}
 return p.result;
}};
const app=createApp(config,{codec,store,writer,preview:true});
const server=createServer(async(req,res)=>{
 if(req.headers.host!=='localhost:'+port){res.writeHead(400);return res.end('FIXTURE_HOST_ONLY');}
 const url=new URL(req.url,config.origin);
 if(req.method==='GET'&&url.pathname==='/fixture-signin'){
   const role=url.searchParams.get('role');if(!['admin','hospital','reviewer','applicant'].includes(role)){res.writeHead(400);return res.end('INVALID_FIXTURE_ROLE');}
   const session=await codec.issue('session',{provider:'google',subject:role+'-sub',email:role+'@example.test',csrf:'fixture-csrf'},900);
   res.writeHead(303,{'Set-Cookie':session.cookie,Location:role==='applicant'?'/register':'/mou/action?hospital_id=09625&year=2569&item_id=1&action='+ (role!=='hospital'?'review':'save')});return res.end();
 }
 return app(req,res);
});
server.listen(port,'127.0.0.1',()=>console.log('Synthetic write QA only: http://localhost:3003/fixture-signin?role=hospital'));
