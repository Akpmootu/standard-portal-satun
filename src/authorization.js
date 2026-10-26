import {reviewProfile,reviewHospitalIds} from './review-access.js';
import { fail } from './errors.js';

export async function resolveAccess(identity, store) {
  fail(identity?.provider === 'google' && typeof identity.subject === 'string', 'SIGN_IN_REQUIRED', 401);
  await store.prefetch?.(['identities','users','reviewer_profiles']);
  // No cache for identities/users: disable or role changes apply on the next request.
  const matches = (await store.table('identities')).filter(row =>
    row.provider === identity.provider && row.provider_subject === identity.subject);
  fail(matches.length <= 1, 'AMBIGUOUS_IDENTITY', 403);
  if (matches.length === 0) return { status: 'unlinked' };
  const mapping = matches[0];
  if (mapping.status !== 'active') return { status: mapping.status === 'disabled' ? 'disabled' : 'pending' };
  fail(mapping.approved_by && mapping.approved_at && mapping.legacy_user_id, 'IDENTITY_NOT_APPROVED', 403);
  const users = (await store.table('users')).filter(row => row.id === mapping.legacy_user_id);
  fail(users.length === 1, 'INVALID_USER_MAPPING', 403);
  const user = users[0];
  fail(user.account_status === 'active', 'ACCOUNT_DISABLED', 403);
  fail(['admin', 'hospital', 'reviewer'].includes(user.role), 'UNKNOWN_ROLE', 403);
  fail(user.role !== 'hospital' || /^\d{5}$/.test(user.hospital_id), 'INVALID_HOSPITAL_MAPPING', 403);
  const profile=user.role==='reviewer'?reviewProfile(await store.table('reviewer_profiles'),user.id):null;
  return { status: 'active', user: { id: user.id, role: user.role, hospitalId: user.hospital_id, userGroup: user.user_group, ...(profile?{reviewProfile:profile}:{}) } };
}

export function requireHospital(access, hospitalId, fiscalYear, module='mou') {
  fail(/^\d{5}$/.test(hospitalId), 'INVALID_HOSPITAL_ID', 400);
  fail(access.status === 'active', 'APPROVAL_REQUIRED', 403);
  fail(access.user.role === 'admin' || (access.user.role==='reviewer'?module==='mou'&&reviewHospitalIds(access.user,fiscalYear).includes(hospitalId):access.user.hospitalId === hospitalId), 'HOSPITAL_ACCESS_DENIED', 403);
}

export async function assessments(store, access, module, hospitalId, fiscalYear) {
  const tables = { mou: 'mou_progress', ctam: 'ctam_progress', hait: 'rg12_progress' };
  fail(Object.hasOwn(tables, module), 'UNKNOWN_MODULE', 400);
  requireHospital(access, hospitalId, fiscalYear, module);
  if (module === 'mou') fail(/^\d{4}$/.test(fiscalYear || ''), 'INVALID_FISCAL_YEAR', 400);
  const rows = await store.table(tables[module]);
  return rows.filter(row => row.hospital_id === hospitalId
    && (module !== 'mou' || String(row.fiscal_year) === fiscalYear));
}
