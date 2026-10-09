import { randomBytes, timingSafeEqual } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { fail } from './errors.js';

export const randomToken = () => randomBytes(32).toString('base64url');
export function equalToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export function cookies(header = '') {
  const result = Object.create(null);
  for (const part of header.split(';')) {
    const position = part.indexOf('=');
    if (position < 0) continue;
    const key = part.slice(0, position).trim();
    // Reject ambiguous duplicate cookies, rather than accepting an attacker-selected value.
    fail(!(key in result), 'INVALID_COOKIE', 400);
    result[key] = part.slice(position + 1).trim();
  }
  return result;
}

export function sessionCodec(config, now = () => new Date()) {
  const key = Buffer.from(config.sessionKey, 'hex');
  const name = purpose => `${config.secure ? '__Host-' : ''}portal_${purpose}`;
  function cookie(purpose, value, seconds) {
    return `${name(purpose)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${config.secure ? '; Secure' : ''}`;
  }
  return {
    name,
    clear: purpose => cookie(purpose, '', 0),
    async issue(purpose, payload, seconds) {
      fail(key.length === 32, 'LOGIN_NOT_CONFIGURED');
      const issued = Math.floor(now().getTime() / 1000);
      const value = await new EncryptJWT(payload).setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
        .setIssuer(config.origin).setAudience(`standard-portal:${purpose}`)
        .setIssuedAt(issued).setExpirationTime(issued + seconds).encrypt(key);
      return { value, cookie: cookie(purpose, value, seconds) };
    },
    async read(purpose, header) {
      const value = cookies(header)[name(purpose)];
      if (!value || !config.sessionKey || value.length > 4096) return null;
      try {
        const { payload } = await jwtDecrypt(value, key, {
          issuer: config.origin, audience: `standard-portal:${purpose}`,
          keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'], currentDate: now(),
        });
        return payload;
      } catch { return null; }
    },
  };
}
