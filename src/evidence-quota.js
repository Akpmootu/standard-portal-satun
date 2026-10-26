import {fail} from './errors.js';
export const EVIDENCE_QUOTAS={accountBytes:50*1024*1024,unitBytes:200*1024*1024,portalBytes:1024*1024*1024,accountFiles:100,unitFiles:500,portalFiles:4000,dailyFiles:10,dailyBytes:20*1024*1024,outstandingFiles:20};
export function evidenceAttached(tables,file){return ['mou_progress','ctam_progress','rg12_progress'].some(name=>(tables[name]||[]).some(row=>row.evidence_file===file.id));}
export function evidenceUsage(tables,actorId,hospitalId,now=new Date()){
 const day=new Date(now.getTime()+7*3600000).toISOString().slice(0,10),files=tables.files;
 fail(Array.isArray(files),'EVIDENCE_QUOTA_INVALID');
 for(const f of files)fail(Number.isSafeInteger(f.size_bytes)&&f.size_bytes>=0&&['uploading','complete','retiring','trashed','released'].includes(f.upload_state),'EVIDENCE_QUOTA_INVALID');
 const retained=files.filter(f=>f.upload_state!=='released'),account=retained.filter(f=>f.created_by===actorId),unit=retained.filter(f=>f.hospital_id===hospitalId),daily=files.filter(f=>f.created_by===actorId&&String(f.created_at).slice(0,10)===day);
 const size=rows=>rows.reduce((total,f)=>total+f.size_bytes,0),summary=rows=>({files:rows.length,bytes:size(rows)});
 return {account:summary(account),unit:summary(unit),portal:summary(retained),daily:summary(daily),outstanding:account.filter(f=>['uploading','complete','retiring'].includes(f.upload_state)&&!evidenceAttached(tables,f)).length};
}
export function requireEvidenceQuota(tables,actorId,hospitalId,bytes,now=new Date()){
 const u=evidenceUsage(tables,actorId,hospitalId,now),q=EVIDENCE_QUOTAS;
 fail(u.portal.bytes+bytes<=q.portalBytes&&u.portal.files<q.portalFiles,'EVIDENCE_PORTAL_QUOTA_REACHED',429);
 fail(u.unit.bytes+bytes<=q.unitBytes&&u.unit.files<q.unitFiles,'EVIDENCE_UNIT_QUOTA_REACHED',429);
 fail(u.account.bytes+bytes<=q.accountBytes&&u.account.files<q.accountFiles,'EVIDENCE_ACCOUNT_QUOTA_REACHED',429);
 fail(u.daily.files<q.dailyFiles&&u.daily.bytes+bytes<=q.dailyBytes,'EVIDENCE_DAILY_QUOTA_REACHED',429);
 fail(u.outstanding<q.outstandingFiles,'UPLOAD_LIMIT_REACHED',429);
 return u;
}
