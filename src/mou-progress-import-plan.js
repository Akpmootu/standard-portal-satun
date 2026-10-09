import {fail} from './errors.js';
import {MOU_HOSPITAL_IDS} from './mou-reference.js';
import {referenceImportPlan} from './reference-import-plan.js';
import {safeEvidenceUrl} from './mou-read.js';
import schema from './schema.json' with {type:'json'};

export const MOU_IMPORT_YEAR=2569;
const columns=['id','hospital_id','item_id','fiscal_year','status','assessment_detail','evidence_type','has_legacy_file','evidence_link','admin_status','admin_comment','admin_reviewed_at','admin_reviewed_by','updated_at','updated_by'];
function exact(record,keys){fail(record&&typeof record==='object'&&!Array.isArray(record)&&Object.keys(record).sort().join('|')===[...keys].sort().join('|'),'MOU_EXPORT_SCHEMA_MISMATCH');}
function text(value,max=10000){fail(value===null||typeof value==='string'&&value.length<=max,'MOU_EXPORT_INVALID_TEXT');return value??'';}
function sourceId(value){fail(typeof value==='string'&&/^[1-9]\d{0,15}$/.test(value),'MOU_EXPORT_INVALID_ID');return value;}
function date(value){const s=text(value,100);fail(!s||/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s),'MOU_EXPORT_INVALID_DATE');return s;}

// Pure validation/planning. No Google calls, writes, identity mapping, or link fetching.
export function mouProgressImportPlan(data,reference){
  referenceImportPlan(reference);
  exact(data,['format','exported_at_utc','source','fiscal_year','source_count','records']);
  exact(data.source,['host','project','read_only']);
  fail(data.format==='standard-portal-mou-progress-v1'&&data.source.host==='192.168.0.44'&&data.source.project==='/var/www/html/digital_stn/hait-RG12'&&data.source.read_only===true,'MOU_EXPORT_WRONG_SOURCE');
  fail(data.fiscal_year===MOU_IMPORT_YEAR,'MOU_EXPORT_WRONG_YEAR');
  fail(typeof data.exported_at_utc==='string'&&Number.isFinite(Date.parse(data.exported_at_utc)),'MOU_EXPORT_INVALID_TIME');
  fail(Array.isArray(data.records)&&data.records.length<=schema.mou_progress.maxRows,'MOU_EXPORT_LIMIT_EXCEEDED');
  fail(Number.isSafeInteger(data.source_count)&&data.source_count===data.records.length,'MOU_EXPORT_COUNT_MISMATCH');
  const hospitals=new Set(reference.hospitals.map(h=>h.id)),items=new Set(reference.mou_items.map(i=>i.id));
  const seen=new Set(),naturalKeys=new Set(),units=new Set(),statuses={none:0,completed:0,in_progress:0,cannot_do:0};
  const reviews={pending:0,approved:0,rejected:0};let linked=0,unsafeLinks=0,filesPending=0;
  const requestId='mou-import-'+data.exported_at_utc.replace(/[^\d]/g,'');
  const records=data.records.map(row=>{
    exact(row,columns);sourceId(row.id);sourceId(row.item_id);
    fail(typeof row.hospital_id==='string'&&MOU_HOSPITAL_IDS.includes(row.hospital_id)&&hospitals.has(row.hospital_id),'MOU_EXPORT_HOSPITAL_OUT_OF_SCOPE');
    fail(items.has(row.item_id),'MOU_EXPORT_ORPHAN_ITEM');
    fail(row.fiscal_year===MOU_IMPORT_YEAR||row.fiscal_year===String(MOU_IMPORT_YEAR),'MOU_EXPORT_WRONG_YEAR');
    const natural=row.hospital_id+'|'+row.item_id+'|'+MOU_IMPORT_YEAR;
    fail(!seen.has(row.id)&&!naturalKeys.has(natural),'MOU_EXPORT_DUPLICATE');seen.add(row.id);naturalKeys.add(natural);units.add(row.hospital_id);
    fail(Object.hasOwn(statuses,row.status),'MOU_EXPORT_INVALID_STATUS');statuses[row.status]++;
    const review=text(row.admin_status,30)||'pending';fail(Object.hasOwn(reviews,review),'MOU_EXPORT_INVALID_REVIEW');reviews[review]++;
    const evidenceType=text(row.evidence_type,20)||'none';fail(['none','file','link'].includes(evidenceType),'MOU_EXPORT_INVALID_EVIDENCE_TYPE');
    fail(typeof row.has_legacy_file==='boolean','MOU_EXPORT_INVALID_FILE_FLAG');if(row.has_legacy_file)filesPending++;
    const link=text(row.evidence_link,2048);if(link){linked++;if(!safeEvidenceUrl(link))unsafeLinks++;}
    const reviewer=text(row.admin_reviewed_by,100),updater=text(row.updated_by,30);
    fail(!updater||/^\d+$/.test(updater),'MOU_EXPORT_INVALID_ACTOR');
    // Namespaced legacy attribution is provenance, not an active account grant.
    return {id:'legacy-mou-'+row.id,hospital_id:row.hospital_id,item_id:row.item_id,fiscal_year:MOU_IMPORT_YEAR,status:row.status,
      assessment_detail:text(row.assessment_detail),evidence_type:evidenceType,evidence_file:row.has_legacy_file?'legacy-file-pending':'',evidence_link:link,
      admin_status:review,admin_comment:text(row.admin_comment),admin_reviewed_at:date(row.admin_reviewed_at),admin_reviewed_by:reviewer?'legacy:'+reviewer:'',
      updated_at:date(row.updated_at),updated_by:updater?'legacy:'+updater:'',_version:1,_request_id:requestId};
  });
  return {name:'mou_progress',headers:schema.mou_progress.headers,rows:records.map(r=>schema.mou_progress.headers.map(h=>r[h])),summary:{fiscalYear:MOU_IMPORT_YEAR,records:records.length,hospitals:units.size,statuses,reviews,links:linked,unsafeLinks,filesPending,writesPerformed:false}};
}

export function requireEmptyMouTarget(values){
  fail(Array.isArray(values)&&JSON.stringify(values[0])===JSON.stringify(schema.mou_progress.headers),'MOU_TARGET_SCHEMA_MISMATCH');
  fail(values.slice(1).every(row=>Array.isArray(row)&&row.every(v=>v==null||v==='')),'MOU_TARGET_NOT_EMPTY');
}
