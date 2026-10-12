import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOverview,overviewPage} from '../src/overview-page.js';
import {reviewerFixture} from './fixtures/mou-write-data.js';
import {createServer} from 'node:http';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';

function fixture(){const t=reviewerFixture();t.mou_agencies.push({id:'11402',user_group:'โรงพยาบาล',classification_source:'owner_confirmed',status:'confirmed'});Object.assign(t,{ctam_items:[{id:'1'}],ctam_progress:[],rg12_sub_items:[{id:'1'}],rg12_progress:[]});t.mou_progress.push({...t.mou_progress[0],id:'out-of-scope',hospital_id:'11402'});const calls=[];return {calls,store:{table:async n=>{calls.push(n);return t[n]||[];},directory:async ids=>ids.map(id=>({id,name:'หน่วยบริการตัวอย่าง'}))}};}
test('overview aggregates scoped data without expanding reviewer access or reading identities',async()=>{
 const {store,calls}=fixture();
 const m=await loadOverview(store,{status:'active',user:{role:'reviewer',reviewProfile:{hospitalIds:['09625'],years:[2569]}}},'2569');
 assert.equal(m.modules.length,1);assert.equal(m.modules[0].module,'mou');assert.equal(m.modules[0].units,1);assert.equal(m.modules[0].completed,1);assert.equal(m.modules[0].rejected,1);
 assert.ok(!calls.includes('ctam_progress'));assert.ok(!calls.includes('rg12_progress'));assert.ok(!calls.includes('users'));
 assert.ok(!overviewPage(m).includes('href="/ctam"'));
});
test('overview HTTP resolves current roles and denies a disabled account on its next request',async t=>{
 const data=reviewerFixture(),reads=[];
 const config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_LOGIN_CLIENT_ID:'fake',GOOGLE_LOGIN_CLIENT_SECRET:'fake',GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake'}),codec=sessionCodec(config);
 const store={table:async n=>{reads.push(n);return data[n]||[];},directory:async ids=>ids.map(id=>({id,name:'ตัวอย่าง'}))};
 const server=createServer(createApp(config,{codec,store}));await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;
 t.after(()=>{server.closeAllConnections();server.close();});
 assert.equal((await fetch(config.origin+'/overview',{redirect:'manual'})).status,303);assert.equal(reads.length,0);
 const cookie=(await codec.issue('session',{provider:'google',subject:'reviewer-sub',csrf:'test'},60)).cookie.split(';')[0];
 const response=await fetch(config.origin+'/overview?year=2569',{headers:{cookie}});assert.equal(response.status,200);assert.ok((await response.text()).includes('ภาพรวมระบบประเมิน'));assert.ok(!reads.includes('ctam_progress'));
 data.users.find(u=>u.id==='u3').account_status='disabled';reads.length=0;
 assert.equal((await fetch(config.origin+'/overview?year=2569',{headers:{cookie}})).status,403);assert.ok(!reads.includes('mou_progress'));
});
test('overview distinguishes no records from completion and rejects invalid inputs before data reads',async()=>{
 const {store,calls}=fixture();
 await assert.rejects(loadOverview(store,{status:'pending'},'2569'),{code:'APPROVAL_REQUIRED'});
 await assert.rejects(loadOverview(store,{status:'active',user:{role:'admin'}},'2569.0'),{code:'INVALID_FISCAL_YEAR'});assert.equal(calls.length,0);
 const m=await loadOverview(store,{status:'active',user:{role:'hospital',hospitalId:'11402'}},'2570');
 assert.equal(m.modules[0].completed,0);assert.equal(m.modules[1].total,1);assert.equal(m.modules[1].completed,0);assert.equal(m.modules[1].approved,0);assert.equal(m.modules[1].pending,0);
});
