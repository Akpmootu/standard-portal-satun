import {MOU_HOSPITAL_IDS,HOSPITAL_HEADERS} from './mou-reference.js';
import {normalizeCatalog} from './mou-read.js';
import schema from './schema.json' with {type:'json'};
function check(ok,message) {if(!ok)throw new Error(message);}
function exactKeys(record,keys) {
 check(record&&typeof record==='object'&&!Array.isArray(record),'INVALID_RECORD');
 check(Object.keys(record).sort().join('|')===[...keys].sort().join('|'),'UNEXPECTED_REFERENCE_FIELDS');
}
function rows(records,keys,limit) {
 check(Array.isArray(records)&&records.length<=limit,'REFERENCE_LIMIT_EXCEEDED');
 for(const r of records){exactKeys(r,keys);for(const v of Object.values(r))check(v===null||typeof v==='number'||typeof v==='string'&&v.length<=20000,'INVALID_REFERENCE_VALUE');}
}
export function referenceImportPlan(data) {
 exactKeys(data,['format','exported_at_utc','source','hospitals','agency_groups','mou_categories','mou_items','mou_settings']);
 check(data.format==='standard-portal-mou-reference-v1','INVALID_EXPORT_FORMAT');
 exactKeys(data.source,['host','project','read_only']);
 check(data.source.host==='192.168.0.44'&&data.source.project==='/var/www/html/digital_stn/hait-RG12'&&data.source.read_only===true,'WRONG_REFERENCE_SOURCE');
 check(typeof data.exported_at_utc==='string'&&Number.isFinite(Date.parse(data.exported_at_utc)),'INVALID_EXPORT_TIME');
 rows(data.hospitals,['id','reference_id','name','type'],100);
 rows(data.agency_groups,['hospital_id','user_group'],150);
 rows(data.mou_categories,['id','category_number','title','sort_order'],100);
 rows(data.mou_items,['id','category_id','item_number','title','target_group','period','sort_order'],500);
 rows(data.mou_settings,['id','setting_key','setting_value','label','updated_at'],2);
 check(data.hospitals.length>0&&data.mou_categories.length>0&&data.mou_items.length>0,'EMPTY_REFERENCE_EXPORT');
 const seen=new Set(),referenceIds=new Set();
 for(const h of data.hospitals){
  check(typeof h.id==='string'&&MOU_HOSPITAL_IDS.includes(h.id)&&!seen.has(h.id),'INVALID_HOSPITAL_REFERENCE');seen.add(h.id);
  check(typeof h.reference_id==='string'&&h.reference_id&&!referenceIds.has(h.reference_id),'INVALID_REFERENCE_PRIMARY_KEY');referenceIds.add(h.reference_id);
  check(typeof h.name==='string'&&h.name.trim()&&typeof h.type==='string','INVALID_HOSPITAL_REFERENCE');
 }
 const groupMap=new Map();
 for(const g of data.agency_groups){
  check(typeof g.hospital_id==='string'&&seen.has(g.hospital_id),'ORPHAN_AGENCY_GROUP');
  check(g.user_group===null||typeof g.user_group==='string','INVALID_AGENCY_GROUP');
  const group=groupMap.get(g.hospital_id)||new Set();if(g.user_group)group.add(g.user_group);groupMap.set(g.hospital_id,group);
 }
 normalizeCatalog(data.mou_categories,data.mou_items,data.mou_settings);
 const requestId='reference-import-'+data.exported_at_utc.replace(/[^\d]/g,'');
 const table=(name,records)=>({name,headers:schema[name].headers,rows:records.map(r=>schema[name].headers.map(key=>key==='_version'?1:key==='_request_id'?requestId:r[key]??''))});
 const tables=[table('mou_categories',data.mou_categories),table('mou_items',data.mou_items),table('mou_settings',data.mou_settings)];
 tables.push({name:'c_hosoffice',headers:HOSPITAL_HEADERS,rows:data.hospitals.map(h=>HOSPITAL_HEADERS.map(key=>({'ชื่อ':h.name,hoscode9new:h.reference_id,hoscode:h.id,'ประเภทหน่วยบริการสุขภาพ':h.type}[key]??'')))});
 return {requestId,tables,agencyGroups:data.agency_groups,summary:{hospitals:data.hospitals.length,categories:data.mou_categories.length,items:data.mou_items.length,settings:data.mou_settings.length,missingHospitalIds:MOU_HOSPITAL_IDS.filter(id=>!seen.has(id)),ambiguousGroupIds:[...groupMap].filter(([,groups])=>groups.size>1).map(([id])=>id),writesPerformed:false}};
}
