import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import schema from '../src/schema.json' with {type:'json'};
test('registration setup adds only empty tables atomically and never grants users; re-run is read-only',()=>{
 let mode='0',batches=[],sheets=[],bad=false;
 const context=vm.createContext({WRITER_SCHEMA:schema,WRITER_SHEET_ID:'target',console:{log:()=>{}},writerAssert:(ok,c)=>{if(!ok)throw Error(c);},writerColumn:()=> 'Z',PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='MOU_WRITES_ENABLED'?mode:'target'})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},Sheets:{Spreadsheets:{get:()=>({sheets}),Values:{get:(id,range)=>({values:[bad?['bad']:schema[range.split("'")[1]].headers]})},batchUpdate:(body,id)=>{assert.equal(id,'target');batches.push(body);sheets=body.requests.filter(r=>r.addSheet).map(r=>({properties:r.addSheet.properties}));}}}});
 vm.runInContext(readFileSync(new URL('../apps-script/SetupRegistration.gs',import.meta.url),'utf8'),context);
 context.setupRegistrationTables();assert.equal(batches.length,1);assert.equal(sheets.length,2);assert.deepEqual(Array.from(sheets,s=>s.properties.title),['reviewer_profiles','registration_requests']);
 assert.ok(batches[0].requests.filter(r=>r.updateCells).every(r=>r.updateCells.range.startRowIndex===0&&r.updateCells.rows.length===1));
 context.setupRegistrationTables();assert.equal(batches.length,1);
 bad=true;assert.throws(()=>context.setupRegistrationTables(),/SCHEMA_MISMATCH/);assert.equal(batches.length,1);
 mode='1';assert.throws(()=>context.setupRegistrationTables(),/DISABLE_WRITES_FIRST/);
});
