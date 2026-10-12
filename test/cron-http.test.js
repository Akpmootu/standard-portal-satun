import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {writeFixture} from './fixtures/mou-write-data.js';
import {PortalError} from '../src/errors.js';
import {serviceSlot} from '../src/service-rules.js';

async function setup(t,send,broken=false){
 const data=writeFixture();data.identities[1].email='owner@example.org';
 const config=readConfig({APP_ORIGIN:'http://127.0.0.1:3000',SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_OWNER_EMAIL:'owner@example.org',CRON_SECRET:'TEST_ONLY_BEARER',TELEGRAM_ENABLED:'1',TELEGRAM_DESTINATION_CONFIRMED:'1'}),logs=[];
 const store={table:async n=>{if(broken&&n==='mou_agencies')throw Error('PRIVATE_PROVIDER_DETAIL');return data[n]||[];},directory:async ids=>ids.map(id=>({id,name:'หน่วยบริการทดสอบ'}))};
 const server=createServer(createApp(config,{store,integrations:{send},cronLog:r=>logs.push(r)}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 config.origin='http://127.0.0.1:'+server.address().port;
 return {logs,data,get:headers=>fetch(config.origin+'/api/integrations/cron',{headers})};
}
test('cron records only aggregate timing and counts after authorized scheduled endpoint succeeds',async t=>{
 let sends=0;const {logs,get}=await setup(t,async()=>{sends++;return {ok:true,messageId:'PRIVATE_MESSAGE_ID'};});
 assert.equal((await get({})).status,403);assert.equal(logs.length,0);assert.equal(sends,0);
 const response=await get({authorization:'Bearer TEST_ONLY_BEARER'});assert.equal(response.status,200);assert.equal((await response.json()).ok,true);
 assert.ok(sends>=1);assert.equal(logs[0].phase,'started');assert.equal(logs[1].sent,sends);assert.equal(logs[1].failed,0);
 assert.ok(!/PRIVATE|owner@example|TEST_ONLY|10746|09625/.test(JSON.stringify(logs)));
});
test('cron fails visibly without retrying uncertain delivery and skips only duplicates proven sent',async t=>{
 let calls=0;const first=await setup(t,async()=>{calls++;throw new PortalError('TELEGRAM_DELIVERY_UNCERTAIN',503);});
 const response=await first.get({authorization:'Bearer TEST_ONLY_BEARER'});assert.equal(response.status,503);assert.equal((await response.json()).ok,false);
 assert.equal(first.logs[1].failed,calls);assert.equal(first.logs[1].sent,0);
 const duplicate=await setup(t,async()=>{throw new PortalError('SERVICE_ALREADY_RESERVED',409);});
 for(const kind of ['daily','weekly'])duplicate.data.audit_log.push({id:'reservation-'+kind,record_type:'service',action:'telegram',changed_fields:JSON.stringify({kind,slot:serviceSlot(kind)})},{record_type:'service',action:'settle',record_id:'reservation-'+kind,changed_fields:JSON.stringify({outcome:'sent'})});
 const skipped=await duplicate.get({authorization:'Bearer TEST_ONLY_BEARER'});assert.equal(skipped.status,200);assert.equal((await skipped.json()).ok,true);
 assert.equal(duplicate.logs[1].sent,0);assert.ok(duplicate.logs[1].skipped>=1);assert.equal(duplicate.logs[1].failed,0);
 duplicate.data.audit_log.filter(r=>r.action==='settle').forEach(r=>r.changed_fields=JSON.stringify({outcome:'uncertain'}));
 const uncertainDuplicate=await duplicate.get({authorization:'Bearer TEST_ONLY_BEARER'});assert.equal(uncertainDuplicate.status,503);assert.equal((await uncertainDuplicate.json()).results[0].error,'SCHEDULED_DELIVERY_UNCONFIRMED');
});
test('cron summary read failure is observable and hides private provider errors without sending',async t=>{
 let sends=0;const {logs,get}=await setup(t,async()=>{sends++;},true);
 const response=await get({authorization:'Bearer TEST_ONLY_BEARER'});assert.equal(response.status,503);assert.deepEqual(await response.json(),{ok:false,error:'SCHEDULED_SUMMARY_UNAVAILABLE'});
 assert.equal(sends,0);assert.equal(logs[1].phase,'failed');assert.ok(!JSON.stringify(logs).includes('PRIVATE_PROVIDER_DETAIL'));
});
