import {referenceImportPlan} from './reference-import-plan.js';
import {normalizeAgencies,AGENCY_GROUPS} from './mou-agencies.js';
import {fail} from './errors.js';
import schema from './schema.json' with {type:'json'};

// Pure planning only: callers supply explicit owner-confirmed corrections.
export function agencyImportPlan(snapshot,confirmed={}) {
  const reference=referenceImportPlan(snapshot);
  const ids=snapshot.hospitals.map(h=>h.id);
  for(const [id,group] of Object.entries(confirmed))fail(ids.includes(id)&&Object.hasOwn(AGENCY_GROUPS,group),'INVALID_AGENCY_OVERRIDE');
  const records=ids.map(id=>{
    const groups=new Set(reference.agencyGroups.filter(g=>g.hospital_id===id&&g.user_group).map(g=>g.user_group));
    const override=Object.hasOwn(confirmed,id);
    const group=override?confirmed[id]:groups.size===1?[...groups][0]:'';
    const known=Object.hasOwn(AGENCY_GROUPS,group);
    return {id,user_group:known?group:'',classification_source:override?'owner_confirmed':known?'legacy_export':'unresolved',status:known?'confirmed':'pending',_version:1,_request_id:reference.requestId+'-agencies'};
  });
  normalizeAgencies(records);
  return {name:'mou_agencies',headers:schema.mou_agencies.headers,rows:records.map(r=>schema.mou_agencies.headers.map(h=>r[h])),records};
}
