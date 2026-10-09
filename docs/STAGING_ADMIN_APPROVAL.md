# Staging administrator approval — 2026-09-04

The owner explicitly confirmed granting `dh.satun@gmail.com` administrator access to **Staging only** in this conversation. No production account, password, or role was changed.

## Identity and scope

- Google subject: `105901654284038831315`, matched between the owner's successful login screenshot and the connected Google Drive profile.
- Staging user ID: `staging-admin-dh-satun`; this is a new staging-only record, not an imported legacy account.
- Identity record ID: `staging-google-dh-satun`.
- Role/status: `admin` / `active`; group: `staging`.
- The existing `legacy_user_id` field points to the new staging user ID for schema compatibility. It does not assert that this ID exists in the PHP/MySQL system.
- Recorded at: `2026-09-04T02:03:11Z`; approval reference: `staging-admin-approved-20260904`.

## Exact changes

[Standard Portal - Application Data](https://docs.google.com/spreadsheets/d/1dWXmgRRg1yP39OSxl2PmFarlH1xAi1gaKy-rJc4Ve7k/edit):

- `users!A2:J2`: one new staging administrator.
- `identities!A2:K2`: one explicitly approved Google-to-user mapping.

Both tabs were checked empty before writing. One atomic batch updated values only; headers, formatting, validation, other tabs, and Drive sharing were preserved. Readback verified exact text identifiers, numeric version fields, and valid `active` statuses. The application page then displayed “บัญชีได้รับอนุมัติแล้ว · admin”.

The optional `/api/admin/storage-check` browser check was blocked by the browser client; it was not bypassed or counted as passed. The owner had separately supplied a successful CLI resource check before this mapping.

## Operational boundary

This does not add Google write scopes, assessment writes, attachment uploads, production data, or a public deployment. Admin authorization is read from the configured Sheets on each request. Reusing these staging credentials or Sheets for production would also carry this mapping; do not do so without a separate migration review.

To revoke later, an authorized administrator can set `identities!G2` and `users!H2` to `disabled`; no rows need to be deleted. Revocation was not performed in this task.
