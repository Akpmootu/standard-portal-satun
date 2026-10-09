import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceImportPlan} from '../src/reference-import-plan.js';
import {agencyImportPlan} from '../src/agency-import-plan.js';
const fixture=()=>({format:'standard-portal-mou-reference-v1',exported_at_utc:'2026-09-04T00:00:00Z',source:{host:'192.168.0.44',project:'/var/www/html/digital_stn/hait-RG12',read_only:true},hospitals:[{id:'09625',reference_id:'000000001',name:'หน่วยบริการทดสอบ',type:'ทดสอบ'}],agency_groups:[{hospital_id:'09625',user_group:'โรงพยาบาลส่งเสริมสุขภาพตำบล'}],mou_categories:[{id:'1',category_number:1,title:'หมวดทดสอบ',sort_order:1}],mou_items:[{id:'11',category_id:'1',item_number:'1.1',title:'=literal text',target_group:'all',period:'all',sort_order:1}],mou_settings:[{id:'1',setting_key:'allow_6months_edit',setting_value:'0',label:'รอบทดสอบ',updated_at:null}]});
test('import plan preserves string IDs and sparse reference columns without account grants',()=>{
 const plan=referenceImportPlan(fixture()),table=plan.tables.find(t=>t.name==='c_hosoffice');
 assert.equal(table.rows[0][3],'09625');assert.equal(table.rows[0][1],'000000001');
 assert.equal(table.rows[0][14],'');assert.equal(plan.tables.length,4);assert.equal(plan.summary.writesPerformed,false);
 assert.ok(plan.tables.every(t=>!['users','identities','mou_progress'].includes(t.name)));
 assert.equal(plan.tables.find(t=>t.name==='mou_items').rows[0][3],'=literal text');
});
test('export validation refuses extra credential fields, wrong scope and broken references',()=>{
 let f=fixture();f.hospitals[0].password='canary';assert.throws(()=>referenceImportPlan(f),/UNEXPECTED_REFERENCE_FIELDS/);
 f=fixture();f.hospitals[0].id=9625;assert.throws(()=>referenceImportPlan(f),/INVALID_HOSPITAL_REFERENCE/);
 f=fixture();f.mou_items[0].category_id='missing';assert.throws(()=>referenceImportPlan(f),/MOU_CATEGORY_NOT_FOUND/);
 f=fixture();f.source.host='another';assert.throws(()=>referenceImportPlan(f),/WRONG_REFERENCE_SOURCE/);
 f=fixture();f.hospitals.push({...f.hospitals[0]});assert.throws(()=>referenceImportPlan(f),/INVALID_HOSPITAL_REFERENCE/);
});
test('agency import keeps unresolved groups pending unless explicitly confirmed',()=>{
 const f=fixture();f.agency_groups[0].user_group=null;
 assert.equal(agencyImportPlan(f).records[0].status,'pending');
 const confirmed=agencyImportPlan(f,{'09625':'โรงพยาบาล'});
 assert.equal(confirmed.records[0].classification_source,'owner_confirmed');
 assert.equal(confirmed.records[0].user_group,'โรงพยาบาล');
 assert.equal(confirmed.name,'mou_agencies');assert.ok(!confirmed.headers.includes('role'));
 assert.throws(()=>agencyImportPlan(f,{'99999':'โรงพยาบาล'}),/INVALID_AGENCY_OVERRIDE/);
 f.agency_groups=[{hospital_id:'09625',user_group:'โรงพยาบาล'},{hospital_id:'09625',user_group:'สถานีอนามัย'}];
 assert.equal(agencyImportPlan(f).records[0].status,'pending');
});
