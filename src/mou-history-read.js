import {reviewHospitalIds} from './review-access.js';
import { fail } from './errors.js';
import { requireHospital } from './authorization.js';
import { currentFiscalYear, REVIEW_LABELS } from './mou-read.js';
import { MOU_HOSPITAL_IDS } from './mou-reference.js';

function text(value,max=10000) {
  fail(typeof value==='string'&&value.length<=max,'INVALID_MOU_HISTORY');
  return value;
}
function date(value) {
  text(value,19);
  fail(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value),'INVALID_MOU_HISTORY');
  const parsed=new Date(value.replace(' ','T')+'Z');
  fail(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,19).replace('T',' ')===value,'INVALID_MOU_HISTORY');
  return value;
}

// The legacy history screen is admin-only. Check access before any data reads,
// including when the request is unfiltered or asks for another progress ID.
export async function loadMouHistory(store,access,query={},now=new Date()) {
  fail(access?.status==='active'&&['admin','reviewer'].includes(access.user?.role),'ADMIN_REQUIRED',403);
  const currentYear=currentFiscalYear(now);
  const year=query.year==null?currentYear:Number(query.year);
  fail(query.year==null||/^\d{4}$/.test(String(query.year)),'INVALID_FISCAL_YEAR',400);
  fail(year>=2500&&year<=2700,'INVALID_FISCAL_YEAR',400);
  const hospitalId=query.hospitalId||'';
  if(hospitalId){requireHospital(access,hospitalId,year);fail(MOU_HOSPITAL_IDS.includes(hospitalId),'HOSPITAL_OUTSIDE_PROJECT',403);}
  const progressId=query.progressId||'';
  fail(!progressId||/^[A-Za-z0-9_-]{1,100}$/.test(progressId),'INVALID_PROGRESS_ID',400);
  const review=query.review||'all';
  fail(['all','approved','rejected'].includes(review),'INVALID_REVIEW_STATUS',400);
  const page=query.page==null?1:Number(query.page);
  fail(query.page==null||/^[1-9]\d{0,3}$/.test(String(query.page)),'INVALID_PAGE',400);
  const permitted=reviewHospitalIds(access.user,year);
  await store.prefetch?.(['mou_progress','mou_review_history','mou_items']);
  const parents=await store.table('mou_progress');
  const parentIds=new Set();
  for(const r of parents){fail(typeof r.id==='string'&&r.id&&!parentIds.has(r.id),'INVALID_MOU_HISTORY_PARENT');parentIds.add(r.id);}
  const scoped=parents.filter(r=>permitted.includes(r.hospital_id)&&String(r.fiscal_year)===String(year)&&(!hospitalId||r.hospital_id===hospitalId));
  if(progressId)fail(scoped.some(r=>r.id===progressId),'PROGRESS_NOT_FOUND',404);
  const selected=new Map(scoped.filter(r=>!progressId||r.id===progressId).map(r=>[r.id,r]));
  const [history,catalog,directory]=await Promise.all([
    store.table('mou_review_history'),store.table('mou_items'),store.directory(permitted),
  ]);
  const items=new Map(catalog.map(r=>[r.id,r]));
  fail(items.size===catalog.length,'DUPLICATE_MOU_REFERENCE');
  const units=directory.map(r=>({id:r.id,name:r.name})).filter(r=>permitted.includes(r.id)).sort((a,b)=>a.name.localeCompare(b.name,'th'));
  const names=new Map(units.map(r=>[r.id,r.name]));
  const seen=new Set(),events=[];
  for(const row of history){
    fail(typeof row.id==='string'&&row.id&&!seen.has(row.id),'INVALID_MOU_HISTORY');seen.add(row.id);
    fail(parentIds.has(row.progress_id),'ORPHAN_MOU_HISTORY');
    const parent=selected.get(row.progress_id);
    if(!parent)continue;
    fail(['approved','rejected'].includes(row.admin_status),'INVALID_MOU_HISTORY');
    fail(Object.hasOwn(REVIEW_LABELS,parent.admin_status),'INVALID_REVIEW_STATUS');
    const item=items.get(parent.item_id);fail(item,'ORPHAN_MOU_PROGRESS');
    events.push({id:row.id,progressId:row.progress_id,hospitalId:parent.hospital_id,
      hospitalName:names.get(parent.hospital_id)||parent.hospital_id,
      itemNumber:text(item.item_number,10),itemTitle:text(item.title),
      review:row.admin_status,comment:text(row.admin_comment),reviewer:text(row.admin_reviewed_by,200),
      createdAt:date(row.created_at),currentReview:parent.admin_status,
      currentUpdatedAt:text(parent.updated_at,100)});
  }
  events.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id,undefined,{numeric:true}));
  const counts={total:events.length,approved:events.filter(r=>r.review==='approved').length,rejected:events.filter(r=>r.review==='rejected').length,
    pendingParents:new Set(events.filter(r=>r.currentReview==='pending').map(r=>r.progressId)).size};
  const filtered=events.filter(r=>review==='all'||r.review===review),pageSize=25,pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  fail(page<=pages,'PAGE_NOT_FOUND',404);
  return {isAdmin:access.user.role==='admin',canReview:true,isReviewer:access.user.role==='reviewer',readOnly:true,source:'google-sheets',checkedAt:now.toISOString(),currentYear,year,hospitalId,progressId,review,page,pages,pageSize,
    units,counts,filteredCount:filtered.length,events:filtered.slice((page-1)*pageSize,page*pageSize)};
}
