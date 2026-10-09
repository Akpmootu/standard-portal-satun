import schema from './schema.json' with {type:'json'};
import {fail} from './errors.js';
import {MOU_HOSPITAL_IDS} from './mou-reference.js';
export function remainingImportPlan(snapshot){
 fail(snapshot?.format==='standard-portal-remaining-v1'&&snapshot.source?.read_only===true,'INVALID_EXPORT');
 const names=['ctam_items','rg12_chapters','rg12_sub_items','ctam_progress','rg12_progress','ctam_review_history'];
 const plans={};let pendingFiles=0;
 for(const name of names){
  const source=snapshot.tables[name],contract=schema[name];fail(Array.isArray(source)&&source.length<=contract.maxRows,'INVALID_EXPORT');
  const seen=new Set(),natural=new Set();
  const rows=source.map(input=>{
   fail(input&&String(input.id).match(/^[1-9]\d*$/)&&!seen.has(String(input.id)),'DUPLICATE_IMPORT_ID');seen.add(String(input.id));
   const r={...input};
   for(const k of Object.keys(r))if(k==='id'||k.endsWith('_id')||k==='updated_by'||k==='admin_reviewed_by')r[k]=r[k]==null?'':String(r[k]);
   if(name==='ctam_progress'||name==='rg12_progress'){
    fail(MOU_HOSPITAL_IDS.includes(r.hospital_id),'HOSPITAL_OUTSIDE_PROJECT');
    const item=name==='ctam_progress'?'item_id':'sub_item_id',key=r.hospital_id+':'+r[item];fail(!natural.has(key),'DUPLICATE_PROGRESS');natural.add(key);
    const catalog=name==='ctam_progress'?'ctam_items':'rg12_sub_items';fail(snapshot.tables[catalog].some(i=>String(i.id)===r[item]),'ORPHAN_PROGRESS');
    r.status=r.status||(Number(r.is_completed)===1?'completed':'none');
    fail(['none','completed','in_progress','cannot_do'].includes(r.status),'INVALID_MODULE_STATUS');
    r.admin_status=r.admin_status||'pending';fail(['pending','approved','rejected'].includes(r.admin_status),'INVALID_REVIEW_STATUS');
    r.evidence_type=r.evidence_type||'none';fail(['none','link','file'].includes(r.evidence_type),'INVALID_EVIDENCE_TYPE');
    if(r.evidence_file){fail(/^[a-zA-Z0-9_.-]+$/.test(r.evidence_file)&&!r.evidence_file.includes('..'),'UNSAFE_LEGACY_FILE');pendingFiles++;}
    r.id='legacy-'+(name==='ctam_progress'?'ctam':'hait')+'-'+r.id;
    if(name==='rg12_progress')r.is_completed=Number(r.is_completed||0);
   }
   if(name==='ctam_review_history'){
    fail(snapshot.tables.ctam_progress.some(p=>String(p.id)===r.progress_id),'ORPHAN_HISTORY');
    r.id='legacy-ctam-history-'+r.id;r.progress_id='legacy-ctam-'+r.progress_id;
    fail(['approved','rejected'].includes(r.admin_status),'INVALID_REVIEW_STATUS');
   }
   if(name==='rg12_sub_items')fail(snapshot.tables.rg12_chapters.some(c=>String(c.id)===r.chapter_id),'ORPHAN_CATALOG');
   r._version=1;r._request_id='remaining-import-v1';
   return contract.headers.map(h=>r[h]??'');
  });
  plans[name]={headers:contract.headers,rows};
 }
 return {plans,summary:{counts:Object.fromEntries(Object.entries(plans).map(([k,p])=>[k,p.rows.length])),pendingFiles,accountGrants:false}};
}
