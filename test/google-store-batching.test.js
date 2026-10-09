import test from 'node:test';
import assert from 'node:assert/strict';
import {googleStore} from '../src/google-store.js';
import {readConfig} from '../src/config.js';
import schema from '../src/schema.json' with {type:'json'};
import {HOSPITAL_HEADERS} from '../src/mou-reference.js';

const names=['mou_categories','mou_items','mou_settings','mou_agencies'];
function fixture() {
  const calls=[],config=readConfig({}),values=Object.fromEntries(Object.entries(schema).map(([k,v])=>[k,[v.headers]]));
  const state={rows:100,fail:false,short:false,reverse:false};
  const client={request:async req=>{
    calls.push(req);if(state.fail)throw Error('UPSTREAM_SECRET_CANARY');
    const u=new URL(req.url);
    if(u.pathname.includes(config.referenceSheetId)) {
      if(!u.pathname.endsWith('values:batchGet'))return {data:{sheets:[{properties:{title:'c_hosoffice',gridProperties:{rowCount:100}}}]}};
      const ranges=u.searchParams.getAll('ranges');
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
  return {store:googleStore(config,client),calls,state,values};
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
test('request metadata is deduplicated but values and authorization rows are always fresh',async()=>{
  const {store,calls,values}=fixture();const scoped=store.forRequest();
  await Promise.all([scoped.table('identities'),scoped.tables(names)]);
  assert.equal(calls.filter(c=>!c.url.includes('/values')).length,1);
  const headers=schema.users.headers;
  values.users=[headers,headers.map(k=>({id:'u1',account_status:'active'}[k]??''))];
  assert.equal((await scoped.table('users'))[0].account_status,'active');
  values.users[1][headers.indexOf('account_status')]='disabled';
  assert.equal((await scoped.table('users'))[0].account_status,'disabled');
  await store.forRequest().table('users');
  assert.equal(calls.filter(c=>!c.url.includes('/values')).length,2);
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
