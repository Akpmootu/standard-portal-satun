import {loadReport} from './reports.js';
import {currentFiscalYear} from './mou-read.js';
import {normalizeAgencies} from './mou-agencies.js';
import {fail} from './errors.js';
const allowed=new Set(['mou_agencies','mou_categories','mou_items','mou_settings','mou_progress','ctam_items','ctam_progress','rg12_sub_items','rg12_progress']);
const percent=(n,total)=>total?Math.round(n/total*1000)/10:0;
// Server-owned aggregation scope only. This never authenticates a visitor or grants a role.
// Use the same assessment rules as reports, but never read identities or the national directory.
export async function loadPublicProgress(store,now=new Date()){
 await store.prefetch?.([...allowed]);
 const memo=new Map();const table=name=>{fail(allowed.has(name),'PUBLIC_TABLE_DENIED');if(!memo.has(name))memo.set(name,store.table(name));return memo.get(name);};
 const agencies=normalizeAgencies(await table('mou_agencies'));
 const scoped={table,directory:async ids=>ids.filter(id=>agencies.has(id)).map(id=>({id,name:''}))};
 const year=currentFiscalYear(now),reports=await Promise.all(['mou','ctam','hait'].map(module=>loadReport(scoped,{status:'active',user:{role:'admin'}},{module,year})));
 return {updatedAt:now.toISOString(),fiscalYear:year,refreshSeconds:60,stale:false,modules:reports.map(r=>{
  const n=r.results.reduce((a,u)=>{a.total+=u.total;a.assessed+=u.total-u.none;a.passed+=u.completed;a.approved+=u.approved;return a;},{total:0,assessed:0,passed:0,approved:0});
  // Explicit numeric projection: never return report rows, evidence, names or unit identifiers.
  return {module:r.module,units:r.results.length,...n,assessmentPercent:percent(n.assessed,n.total),passedPercent:percent(n.passed,n.total),approvedPercent:percent(n.approved,n.total)};
 })};
}
export function publicProgressCache(load,{ttl=60000,clock=Date.now}={}){
 let snapshot=null,expires=0,inflight=null;
 return async()=>{if(snapshot&&clock()<expires)return snapshot;if(inflight)return inflight;
  inflight=(async()=>{try{snapshot=await Promise.resolve().then(load);expires=clock()+ttl;return snapshot;}catch(error){if(!snapshot)throw error;snapshot={...snapshot,stale:true};expires=clock()+30000;return snapshot;}finally{inflight=null;}})();return inflight;
 };
}
