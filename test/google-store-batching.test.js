import test from 'node:test';
import assert from 'node:assert/strict';
import {googleStore} from '../src/google-store.js';
import {readConfig} from '../src/config.js';
import schema from '../src/schema.json' with {type:'json'};
import {HOSPITAL_HEADERS,MOU_HOSPITAL_IDS} from '../src/mou-reference.js';
import {resolveAccess} from '../src/authorization.js';
import {loadOverview} from '../src/overview-page.js';
import {integrationReports} from '../src/integrations.js';

const names=['mou_categories','mou_items','mou_settings','mou_agencies'];
function fixture(runtime={},fullDirectory=false) {
  const calls=[],config=readConfig({}),values=Object.fromEntries(Object.entries(schema).map(([k,v])=>[k,[v.headers]]));
  const state={rows:100,fail:false,short:false,reverse:false};
  const client={request:async req=>{
    calls.push(req);if(state.fail)throw Error('UPSTREAM_SECRET_CANARY');
    const u=new URL(req.url);
    if(u.pathname.includes(config.referenceSheetId)) {
      if(!u.pathname.endsWith('values:batchGet'))return {data:{sheets:[{properties:{title:'c_hosoffice',gridProperties:{rowCount:100}}}]}};
      const ranges=u.searchParams.getAll('ranges');
      if(fullDirectory)return {data:{valueRanges:ranges[0].endsWith('AA1')?[{values:[HOSPITAL_HEADERS]},{values:MOU_HOSPITAL_IDS.map(id=>[id])}]:ranges.map(range=>({values:[['Fixture','','',MOU_HOSPITAL_IDS[Number(range.match(/!A(\d+)/)[1])-2],'','','PCU']]}))}};
      return {data:{valueRanges:ranges[0].endsWith('AA1')?[{values:[HOSPITAL_HEADERS]},{values:[['09625']]}]:[{values:[['Fixture','nine','','09625','','','PCU']]}]}};
    }
    if(u.pathname.endsWith('values:batchGet')){
      let valueRanges=u.searchParams.getAll('ranges').map(range=>({values:values[range.split("'")[1]]}));
      if(state.short)valueRanges.pop();if(state.reverse)valueRanges.reverse();
      return {data:{valueRanges}};
    }
    if(u.pathname.includes('/values/'))return {data:{values:values[decodeURIComponent(u.pathname.split('/values/')[1]).split("'")[1]]}};
    return {data:{sheets:Object.keys(schema).map(title=>({properties:{title,gridProperties:{rowCount:state.rows}}}))}};
  }};
  return {store:googleStore(config,client,null,runtime),calls,state,values};
}
test('four bounded reference tables use one metadata and one batchGet request',async()=>{
  const {store,calls}=fixture();assert.deepEqual(await store.tables(names),[[],[],[],[]]);
  assert.equal(calls.length,2);const u=new URL(calls[1].url);
  assert.equal(u.searchParams.get('valueRenderOption'),'UNFORMATTED_VALUE');
  assert.equal(u.searchParams.getAll('ranges').length,4);
  assert.ok(calls.every(c=>c.method==='GET'));assert.ok(calls.every(c=>!c.body));
});
test('selected-unit read path decreases from 17 to 8 Sheets GETs without changing data',async()=>{
  const legacy=fixture(),modern=fixture();
  async function run(store,batch){
    const identity=await store.table('identities'),users=await store.table('users');
    const [directory,references]=await Promise.all([store.directory(['09625']),batch?store.tables(names):Promise.all(names.map(n=>store.table(n)))]);
    const progress=await store.table('mou_progress');return {identity,users,directory,references,progress};
  }
  assert.deepEqual(await run(modern.store.forRequest(),true),await run(legacy.store,false));
  assert.equal(legacy.calls.length,17);assert.equal(modern.calls.length,8);
});
test('one request shares a consistent snapshot; authorization is fresh on the next request',async()=>{
  const {store,calls,values}=fixture();const scoped=store.forRequest();
  await Promise.all([scoped.table('identities'),scoped.tables(names)]);
  assert.equal(calls.filter(c=>!c.url.includes('/values')).length,1);
  const headers=schema.users.headers;
  values.users=[headers,headers.map(k=>({id:'u1',account_status:'active'}[k]??''))];
  assert.equal((await scoped.table('users'))[0].account_status,'active');
  values.users[1][headers.indexOf('account_status')]='disabled';
  assert.equal((await scoped.table('users'))[0].account_status,'active');
  assert.equal((await store.forRequest().table('users'))[0].account_status,'disabled');
  assert.equal(calls.filter(c=>!c.url.includes('/values')).length,2);
});

test('concurrent table reads share one bounded batch and repeat reads make no network calls',async()=>{
 const {store,calls}=fixture(),scoped=store.forRequest();
 await Promise.all(['identities','users','reviewer_profiles','mou_progress'].map(n=>scoped.table(n)));
 assert.equal(calls.length,2);
 await scoped.table('users');assert.equal(calls.length,2);
});

test('overview batches its fixed datasets: at most six cold and three warm upstream reads including access tables',async()=>{
 const {store,calls}=fixture({},true);
 for(const max of [6,3]){
  calls.length=0;const request=store.forRequest();
  await request.prefetch(['identities','users','reviewer_profiles']);
  const model=await loadOverview(request,{status:'active',user:{role:'admin'}},'2570');
  assert.equal(model.modules.length,3);assert.ok(calls.length<=max,'Google reads '+calls.length+' > '+max);
 }
});

test('one process reserves headroom and rejects excess reads until the rolling window expires',async()=>{
 let clock=0;const {store,calls}=fixture({clock:()=>clock});
 for(let i=0;i<22;i++)await store.table('users');
 await assert.rejects(store.table('users'),e=>e.code==='GOOGLE_QUOTA_EXCEEDED'&&e.retryAfter===60);
 assert.equal(calls.length,45);
 clock=60001;await store.table('users');assert.equal(calls.length,47);
});

test('integration reports batch their fixed tables without sending Telegram',async()=>{
 const {store,calls}=fixture({},true),request=store.forRequest();
 await request.prefetch(['identities','users','reviewer_profiles']);
 const reports=await integrationReports(request,{status:'active',user:{role:'admin'}},2570);
 assert.equal(reports.length,3);assert.ok(calls.length<=6,'Google reads '+calls.length);
});

test('directory cache reuses only projected units across requests, including subsets',async()=>{
 const {store,calls}=fixture({},true);
 const units=await store.forRequest().directory([...MOU_HOSPITAL_IDS]);
 assert.equal(units.length,74);units.find(u=>u.id==='09625').name='Changed by caller';
 const before=calls.length;
 assert.equal((await store.forRequest().directory(['09625']))[0].name,'Fixture');
 assert.equal(calls.length,before);
});

test('a disabled identity takes effect on the next request despite warm directory and table caches',async()=>{
 const {store,values}=fixture();
 const row=(name,r)=>schema[name].headers.map(h=>r[h]??'');
 values.identities=[schema.identities.headers,row('identities',{id:'i',provider:'google',provider_subject:'sub',legacy_user_id:'u',status:'active',approved_by:'owner',approved_at:'yes'})];
 values.users=[schema.users.headers,row('users',{id:'u',role:'hospital',hospital_id:'09625',account_status:'active'})];
 const identity={provider:'google',subject:'sub'};
 assert.equal((await resolveAccess(identity,store.forRequest())).status,'active');
 values.identities=[schema.identities.headers,row('identities',{id:'i',provider:'google',provider_subject:'sub',legacy_user_id:'u',status:'disabled'})];
 assert.equal((await resolveAccess(identity,store.forRequest())).status,'disabled');
});

test('429 causes one upstream call then a shared cooldown, without leaking provider errors',async()=>{
 let clock=0,calls=0;
 const client={request:async()=>{calls++;throw {response:{status:429},message:'SECRET_CANARY'};}};
 const store=googleStore(readConfig({}),client,null,{clock:()=>clock});
 const safe=e=>e.code==='GOOGLE_QUOTA_EXCEEDED'&&e.retryAfter===60&&!String(e).includes('CANARY');
 await assert.rejects(store.forRequest().table('users'),safe);
 await assert.rejects(store.forRequest().table('identities'),safe);
 assert.equal(calls,1);
 clock=60001;await assert.rejects(store.forRequest().table('users'),safe);assert.equal(calls,2);
});

test('reference cache expires and refresh failures do not return stale unit names',async()=>{
 const f=fixture();let clock=0;
 const store=googleStore(readConfig({}),{request:async req=>{
   if(f.state.fail)throw Error('SECRET');
   return {data:req.url.includes('values:batchGet')?{valueRanges:new URL(req.url).searchParams.getAll('ranges')[0].endsWith('AA1')?[{values:[HOSPITAL_HEADERS]},{values:[['09625']]}]:[{values:[['Fresh','','','09625','','','PCU']]}]}:{sheets:[{properties:{title:'c_hosoffice',gridProperties:{rowCount:2}}}]}};
 }},null,{clock:()=>clock});
 assert.equal((await store.forRequest().directory(['09625']))[0].name,'Fresh');
 clock=300001;f.state.fail=true;
 await assert.rejects(store.forRequest().directory(['09625']),/GOOGLE_CONNECTION_FAILED/);
});
test('batch rejects accounts, progress, unknown names and duplicates before network access',async()=>{
  const {store,calls}=fixture();
  for(const input of [[],['users'],['identities'],['mou_progress'],['constructor'],['mou_items','mou_items'],null])await assert.rejects(store.tables(input),/INVALID_TABLE_BATCH/);
  assert.equal(calls.length,0);
});
test('batch fails closed on oversized grids, incomplete replies and swapped headers',async()=>{
  for(const flag of ['rows','short','reverse']){
    const {store,state,calls}=fixture();state[flag]=flag==='rows'?100000:true;
    await assert.rejects(store.tables(names),flag==='rows'?/TABLE_LIMIT_EXCEEDED/:/SCHEMA_MISMATCH/);
    if(flag==='rows')assert.equal(calls.length,1);
  }
});
test('a failed metadata request is not leaked or cached into the next request',async()=>{
  const {store,state}=fixture();state.fail=true;
  await assert.rejects(store.forRequest().tables(names),e=>e.code==='GOOGLE_CONNECTION_FAILED'&&!e.message.includes('CANARY'));
  state.fail=false;assert.deepEqual(await store.forRequest().tables(names),[[],[],[],[]]);
});
