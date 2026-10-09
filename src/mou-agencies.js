import {fail} from './errors.js';
import {MOU_HOSPITAL_IDS} from './mou-reference.js';

// Assessment classification only. This map must never grant account or hospital access.
export const AGENCY_GROUPS=Object.freeze({'สำนักงานสาธารณสุขจังหวัด':'PHO','สำนักงานสาธารณสุขอำเภอ':'DHO','โรงพยาบาลส่งเสริมสุขภาพตำบล':'PCU','ศูนย์สุขภาพชุมชน':'PCU','สถานีอนามัย':'PCU','โรงพยาบาล':'HOSPITAL'});
export function normalizeAgencies(rows) {
  fail(Array.isArray(rows)&&rows.length<=100,'INVALID_AGENCY_REFERENCE');
  const result=new Map();
  for(const row of rows){
    fail(typeof row.id==='string'&&MOU_HOSPITAL_IDS.includes(row.id)&&!result.has(row.id),'INVALID_AGENCY_REFERENCE');
    fail(['confirmed','pending'].includes(row.status),'INVALID_AGENCY_REFERENCE');
    fail(['legacy_export','owner_confirmed','unresolved'].includes(row.classification_source),'INVALID_AGENCY_REFERENCE');
    const known=typeof row.user_group==='string'&&Object.hasOwn(AGENCY_GROUPS,row.user_group);
    fail(row.status!=='confirmed'||known&&row.classification_source!=='unresolved','INVALID_AGENCY_REFERENCE');
    result.set(row.id,row.status==='confirmed'?{type:row.user_group,group:AGENCY_GROUPS[row.user_group]}:{type:'รอตรวจประเภทหน่วยบริการ',group:'UNKNOWN'});
  }
  return result;
}
