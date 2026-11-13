import { createHmac } from 'node:crypto';
import { randomToken } from './session.js';
import { fail } from './errors.js';

// DOPA ThaID (OAuth 2.0 authorization code). Endpoints are configurable so a local mock can be used.
export const THAID_DEFAULTS = {
  authUrl: 'https://imauth.bora.dopa.go.th/api/v2/oauth2/auth/',
  tokenUrl: 'https://imauth.bora.dopa.go.th/api/v2/oauth2/token/',
  scope: 'pid name',
};

export function validCitizenId(pid) {
  if (typeof pid !== 'string' || !/^\d{13}$/.test(pid)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(pid[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(pid[12]);
}

// The citizen ID is never stored. Only a keyed hash links a ThaID login to its registration.
export function thaidSubject(pid, key) {
  fail(/^[a-f\d]{64}$/i.test(key || ''), 'THAID_NOT_CONFIGURED');
  return createHmac('sha256', Buffer.from(key, 'hex')).update('standard-portal-thaid-v1\0' + pid).digest('hex');
}

function decodeJwtPayload(token) {
  if (typeof token !== 'string' || token.length > 16384) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
}

export function validateThaidClaims(tokens, clientId, now = Date.now()) {
  fail(tokens && typeof tokens === 'object', 'INVALID_THAID_IDENTITY', 401);
  // The token response arrives over TLS from the token endpoint with client authentication
  // (OIDC Core 3.1.3.7). Claims may be top-level or inside id_token; both are checked.
  const idClaims = decodeJwtPayload(tokens.id_token) || {};
  if (idClaims.aud !== undefined) {
    const audiences = Array.isArray(idClaims.aud) ? idClaims.aud : [idClaims.aud];
    fail(audiences.includes(clientId), 'INVALID_THAID_IDENTITY', 401);
  }
  if (idClaims.exp !== undefined) fail(Number.isFinite(idClaims.exp) && idClaims.exp > Math.floor(now / 1000), 'EXPIRED_THAID_IDENTITY', 401);
  const pid = String(tokens.pid ?? idClaims.pid ?? '');
  fail(validCitizenId(pid), 'INVALID_THAID_IDENTITY', 401);
  if (tokens.pid !== undefined && idClaims.pid !== undefined) fail(String(tokens.pid) === String(idClaims.pid), 'INVALID_THAID_IDENTITY', 401);
  const pick = key => typeof tokens[key] === 'string' ? tokens[key] : typeof idClaims[key] === 'string' ? idClaims[key] : '';
  const name = (pick('name') || [pick('given_name'), pick('family_name')].filter(Boolean).join(' ')).trim().replace(/\s+/g, ' ');
  return { pid, name: name.slice(0, 150) };
}

export function thaidLogin(config, fetcher = fetch) {
  const { clientId, clientSecret, authUrl, tokenUrl, scope, subjectKey } = config.thaid;
  const redirectUri = `${config.origin}/auth/thaid/callback`;
  return {
    async begin() {
      const flow = { state: randomToken(), provider: 'thaid' };
      const url = new URL(authUrl);
      url.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, scope, state: flow.state }).toString();
      return { flow, url: url.href };
    },
    async complete(code) {
      const response = await fetcher(tokenUrl, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json',
          Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64') },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }).toString(),
      });
      fail(response.ok, 'THAID_SIGN_IN_FAILED', 401);
      const body = await response.text();
      fail(body.length <= 65536, 'THAID_SIGN_IN_FAILED', 401);
      const { pid, name } = validateThaidClaims(JSON.parse(body), clientId);
      // Access/refresh tokens and the citizen ID are deliberately not persisted.
      return { provider: 'thaid', subject: thaidSubject(pid, subjectKey), email: '', name };
    },
  };
}
