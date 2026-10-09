import {fail} from './errors.js';
import {MOU_HOSPITAL_IDS} from './mou-reference.js';

// Approved server-side profile; never use a browser-supplied name or Google display name.
export function reviewProfile(rows,userId){
  const matches=rows.filter(r=>r.user_id===userId);
  fail(matches.length===1,'REVIEW_PROFILE_REQUIRED',403);
  const r=matches[0];
  fail(r.status==='active'&&typeof r.approved_by==='string'&&r.approved_by.trim()&&typeof r.approved_at==='string'&&r.approved_at.trim(),'REVIEW_PROFILE_REQUIRED',403);
  fail(typeof r.display_name==='string'&&r.display_name.trim().length>0&&r.display_name.length<=100,'INVALID_REVIEW_PROFILE',403);
  let hospitals,years;
  try{hospitals=JSON.parse(r.hospital_ids);years=JSON.parse(r.fiscal_years);}catch{fail(false,'INVALID_REVIEW_PROFILE',403);}
  fail(Array.isArray(hospitals)&&hospitals.length<=MOU_HOSPITAL_IDS.length&&hospitals.every(h=>typeof h==='string'&&MOU_HOSPITAL_IDS.includes(h))&&new Set(hospitals).size===hospitals.length,'INVALID_REVIEW_PROFILE',403);
  fail(Array.isArray(years)&&years.length<=201&&years.every(y=>Number.isInteger(y)&&y>=2500&&y<=2700)&&new Set(years).size===years.length,'INVALID_REVIEW_PROFILE',403);
  return {name:r.display_name.trim(),hospitalIds:hospitals,years};
}
export function reviewHospitalIds(user,year){
  if(user.role==='admin')return [...MOU_HOSPITAL_IDS];
  if(user.role==='reviewer')return user.reviewProfile?.years.includes(Number(year))?[...user.reviewProfile.hospitalIds]:[];
  return [user.hospitalId];
}
export function requireReviewerScope(user,hospitalId,year){
  fail(['admin','reviewer'].includes(user.role),'ADMIN_REQUIRED',403);
  fail(user.role==='admin'||reviewHospitalIds(user,year).includes(hospitalId),'REVIEW_SCOPE_DENIED',403);
}
