export function writeFixture(){return {
 identities:[{id:'i1',provider:'google',provider_subject:'hospital-sub',legacy_user_id:'u1',status:'active',approved_by:'admin',approved_at:'yes'},
 {id:'i2',provider:'google',provider_subject:'admin-sub',legacy_user_id:'u2',status:'active',approved_by:'owner',approved_at:'yes'}],
 users:[{id:'u1',role:'hospital',account_status:'active',hospital_id:'09625'},{id:'u2',role:'admin',account_status:'active',hospital_id:''}],
 mou_agencies:[{id:'09625',user_group:'โรงพยาบาลส่งเสริมสุขภาพตำบล',classification_source:'legacy_export',status:'confirmed'}],
 mou_categories:[{id:'1',category_number:1,title:'หมวดทดสอบ',sort_order:1}],
 mou_items:[{id:'1',category_id:'1',item_number:'1.3',title:'ตัวชี้วัดทดสอบ',target_group:'all',period:'9_12_months',sort_order:1}],
 mou_settings:[{id:'1',setting_key:'allow_6months_edit',setting_value:'0'},{id:'2',setting_key:'allow_9_12months_edit',setting_value:'1'}],
 mou_progress:[{id:'legacy-mou-1',hospital_id:'09625',item_id:'1',fiscal_year:2569,status:'completed',assessment_detail:'เดิม',evidence_type:'link',evidence_file:'',evidence_link:'https://example.org/old',admin_status:'rejected',admin_comment:'แก้ไข',admin_reviewed_at:'2026-03-01 12:00:00',admin_reviewed_by:'legacy:ผู้ตรวจ',updated_at:'2026-03-01 12:00:00',updated_by:'legacy:1',_version:1,_request_id:'old'}],
 reviewer_profiles:[{id:'rp-admin',user_id:'u2',display_name:'ผู้ตรวจทดสอบ',hospital_ids:'[]',fiscal_years:'[]',status:'active',approved_by:'owner',approved_at:'2026-09-07',_version:1,_request_id:'fixture'}],
 registration_requests:[],
 mou_review_history:[],audit_log:[],write_requests:[],
};}
export function reviewerFixture(){
 const data=writeFixture();
 data.identities.push({id:'i3',provider:'google',provider_subject:'reviewer-sub',legacy_user_id:'u3',status:'active',approved_by:'owner',approved_at:'2026-09-07'});
 data.users.push({id:'u3',role:'reviewer',account_status:'active',hospital_id:''});
 data.reviewer_profiles.push({id:'rp-reviewer',user_id:'u3',display_name:'ผู้ตรวจสมมติที่ได้รับมอบหมาย',hospital_ids:'["09625"]',fiscal_years:'[2569]',status:'active',approved_by:'u2',approved_at:'2026-09-07',_version:1,_request_id:'fixture'});
 return data;
}
