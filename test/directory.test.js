import test from 'node:test';
import assert from 'node:assert/strict';
import {googleStore} from '../src/google-store.js';
import {readConfig} from '../src/config.js';
import {HOSPITAL_HEADERS} from '../src/mou-reference.js';
function fixture({codes=[['09625'],['99999']],detail=[['หน่วยทดสอบ','nine','9','09625','private-license','org','PCU']],headers=HOSPITAL_HEADERS,rows=100}={}) {
 const calls=[];
 const client={request:async req=>{calls.push(req);const u=new URL(req.url);
  if(!u.pathname.endsWith('values:batchGet'))return {data:{sheets:[{properties:{title:'c_hosoffice',gridProperties:{rowCount:rows}}}]}};
  const ranges=u.searchParams.getAll('ranges');
  return {data:{valueRanges:ranges.length===2&&ranges[0].endsWith('AA1')?[{values:[headers]},{values:codes}]:[{values:detail}]}};
 }};
 return {calls,store:googleStore(readConfig({}),client)};
}
test('reference lookup reads bounded code column and selected rows only, returns no private unused columns',async()=>{
 const {store,calls}=fixture();assert.deepEqual(await store.directory(['09625']),[{id:'09625',name:'หน่วยทดสอบ',type:'PCU'}]);
 assert.ok(calls.every(c=>c.method==='GET'&&c.url.includes('/'+readConfig({}).referenceSheetId)));
 assert.ok(calls[1].url.includes('batchGet'));assert.ok(decodeURIComponent(calls[1].url).includes('D2:D100'));
 assert.ok(decodeURIComponent(calls[2].url).includes('A2:G2'));
});
test('directory rejects numeric and duplicate IDs, changed rows, oversized grid, and invalid schema',async()=>{
 await assert.rejects(fixture({codes:[[9625]]}).store.directory(['09625']),/IDENTIFIER_NOT_TEXT/);
 await assert.rejects(fixture({codes:[['09625'],['09625']]}).store.directory(['09625']),/AMBIGUOUS_HOSPITAL/);
 await assert.rejects(fixture({detail:[['Wrong','n','','09626']]}).store.directory(['09625']),/DIRECTORY_CHANGED_RETRY/);
 await assert.rejects(fixture({rows:50002}).store.directory(['09625']),/TABLE_LIMIT_EXCEEDED/);
 await assert.rejects(fixture({headers:['wrong']}).store.directory(['09625']),/SCHEMA_MISMATCH/);
 const {store,calls}=fixture();await assert.rejects(store.directory(['9625']),/INVALID_HOSPITAL_ID/);assert.equal(calls.length,0);
});
test('empty reference sheet is empty, not a guessed hospital or an unbounded rescan',async()=>{
 const {store,calls}=fixture({codes:[]});assert.deepEqual(await store.directory(['09625']),[]);assert.equal(calls.length,2);
});
