import test from 'node:test';
import assert from 'node:assert/strict';
import {items,hospitals,fiscalYear,visibleItems,lockReason,summary,seedRecords,validateAssessment} from '../public/demo-model.js';
const item=id=>items.find(i=>i.id===id), open={six:true,later:true};
const lock=(id,group,year=2569,settings=open)=>lockReason(item(id),group,year,settings,2569);
test('fiscal year switches at October 1 in Bangkok, not UTC',()=>{
 assert.equal(fiscalYear(new Date('2026-09-30T16:59:59Z')),2569);
 assert.equal(fiscalYear(new Date('2026-09-30T17:00:00Z')),2570);
});
test('agency category restrictions match legacy page while retaining readable items',()=>{
 assert.equal(visibleItems('PCU').length,items.length);
 assert.ok(visibleItems('HOSPITAL').every(i=>i.category!=='6'));
 for(const id of ['2.1','4.3','6.1'])assert.ok(lock(id,'DHO'));
 assert.ok(lock('2.1','PCU'));
 for(const id of ['1.3','3.2','5.6'])assert.equal(lock(id,'DHO'),'');
 for(const i of items)assert.equal(lock(i.id,'PHO'),'');
});
test('item exemptions and CTAM referral are preserved',()=>{
 for(const group of ['DHO','PCU'])assert.ok(lock('3.1',group));
 for(const id of ['4.1','4.2'])assert.ok(lock(id,'PCU'));
 for(const id of ['5.1','5.2','5.6'])assert.equal(lock(id,'HOSPITAL'),'ประเมินผ่านระบบ CTAM+');
 assert.equal(lock('4.3','PCU'),'');
});
test('period switches and noncurrent years lock writes but not all-year current items',()=>{
 assert.ok(lock('1.1','PHO',2569,{six:false,later:true}));
 assert.equal(lock('1.1','PHO',2569,open),'');
 for(const id of ['1.3','5.6'])assert.ok(lock(id,'PHO',2569,{six:true,later:false}));
 assert.equal(lock('2.1','PHO',2569,{six:false,later:false}),'');
 for(const year of [2568,2570])assert.ok(lock('2.1','PHO',year));
});
test('synthetic totals include locked items, isolate units, and handle empty or unknown records',()=>{
 const records=seedRecords(),group=visibleItems('PCU'),s=summary(group,i=>records['DEMO-PCU:'+i.id]);
 assert.equal(s.total,items.length);assert.equal(s.completed+s.in_progress+s.cannot_do+s.none,s.total);
 assert.equal(s.percent,Math.round(s.completed/s.total*100));assert.equal(s.rejected,1);
 records['DEMO-PCU:1.3'].status='cannot_do';assert.notEqual(records['DEMO-PHO:1.3'].status,'cannot_do');
 assert.equal(summary([],()=>null).percent,0);
 assert.equal(summary([{}],()=>({status:'constructor'})).none,1);
 assert.equal(summary([{}],()=>null).none,1);
 assert.ok(hospitals.every(h=>h.id.startsWith('DEMO-')));
});
test('assessment validation requires status, detail and safe HTTP(S) evidence links',()=>{
 const valid={status:'completed',detail:'ตัวอย่าง',link:'https://example.org/evidence'};
 assert.equal(validateAssessment(valid),'');
 for(const status of ['none',null,'approved'])assert.ok(validateAssessment({...valid,status}));
 for(const detail of ['', '   ','x'.repeat(5001)])assert.ok(validateAssessment({...valid,detail}));
 for(const link of ['','example.org','javascript:alert(1)','data:text/html,bad','file:///c:/private','https://user:pass@example.org','https://example.org/'+ 'a'.repeat(2048)])assert.ok(validateAssessment({...valid,link}));
});
