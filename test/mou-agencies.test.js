import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAgencies} from '../src/mou-agencies.js';
import {parseTable} from '../src/google-store.js';
import {loadMouWorkspace,legacyLock} from '../src/mou-read.js';
import schema from '../src/schema.json' with {type:'json'};
const row={id:'09625',user_group:'โรงพยาบาลส่งเสริมสุขภาพตำบล',classification_source:'legacy_export',status:'confirmed'};
test('agency classification requires unique project IDs and explicit valid status/source',()=>{
 assert.equal(normalizeAgencies([row]).get('09625').group,'PCU');
 assert.equal(normalizeAgencies([{...row,status:'pending'}]).get('09625').group,'UNKNOWN');
 for(const rows of [[row,row],[{...row,id:9625}],[{...row,id:'99999'}],[{...row,user_group:'admin'}],[{...row,status:'active'}],[{...row,classification_source:'unresolved'}]])assert.throws(()=>normalizeAgencies(rows),/INVALID_AGENCY_REFERENCE/);
 assert.throws(()=>parseTable('mou_agencies',[schema.mou_agencies.headers,[9625]]),/INVALID_RECORD_ID/);
});
test('reference groups determine policy equally for admin/hospital, never granting access',async()=>{
 const groupRow={...row,user_group:'โรงพยาบาล',classification_source:'owner_confirmed'};
 const store={directory:async()=>[{id:'09625',name:'Fixture',type:'untrusted type'}],table:async name=>{
  if(name==='users')assert.fail('classification must not read account groups');
  if(name==='mou_agencies')return [groupRow];
  return [];
 }};
 const now=new Date('2026-09-04T01:00:00Z');
 for(const role of ['admin','hospital']){
  const access={status:'active',user:{role,hospitalId:'09625',userGroup:'สำนักงานสาธารณสุขจังหวัด'}};
  const m=await loadMouWorkspace(store,access,{hospitalId:'09625'},now);assert.equal(m.unit.group,'HOSPITAL');
 }
 await assert.rejects(loadMouWorkspace(store,{status:'unlinked'},{}),/APPROVAL_REQUIRED/);
 await assert.rejects(loadMouWorkspace(store,{status:'active',user:{role:'hospital',hospitalId:'09626'}},{hospitalId:'09625'}),/HOSPITAL_ACCESS_DENIED/);
});
test('legacy locks retain visible-but-exempt categories and CTAM routing',()=>{
 const item={categoryNumber:2,number:'2.1',period:'all'},settings={six:false,later:true};
 for(const group of ['DHO','PCU'])assert.match(legacyLock(item,group,2569,settings,2569),/ไม่ต้องประเมินหมวดนี้/);
 assert.equal(legacyLock(item,'PHO',2569,settings,2569),'');
 assert.match(legacyLock({...item,categoryNumber:5,number:'5.6'},'HOSPITAL',2569,settings,2569),/CTAM/);
 assert.match(legacyLock({...item,categoryNumber:4,number:'4.2'},'PCU',2569,settings,2569),/ไม่ต้องประเมินข้อนี้/);
});
