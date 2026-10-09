import { OAuth2Client } from 'google-auth-library';
import { equalToken, randomToken } from './session.js';
import { fail } from './errors.js';

export function validateGoogleClaims(payload, expectedNonce, now = Date.now()) {
  fail(payload && ['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss), 'INVALID_GOOGLE_IDENTITY', 401);
  fail(typeof payload.sub === 'string' && payload.sub.length > 0 && payload.sub.length <= 255,
    'INVALID_GOOGLE_IDENTITY', 401);
  fail(payload.email_verified === true && typeof payload.email === 'string', 'UNVERIFIED_GOOGLE_EMAIL', 401);
  fail(equalToken(payload.nonce, expectedNonce), 'INVALID_GOOGLE_NONCE', 401);
  fail(Number.isFinite(payload.exp) && payload.exp > Math.floor(now / 1000), 'EXPIRED_GOOGLE_IDENTITY', 401);
  return { provider: 'google', subject: payload.sub, email: payload.email, name: String(payload.name || '').slice(0, 150) };
}

export function googleLogin(config) {
  const client = new OAuth2Client({ ...config.login, redirectUri: `${config.origin}/auth/google/callback` });
  return {
    async begin() {
      const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
      const flow = { state: randomToken(), nonce: randomToken(), codeVerifier };
      return { flow, url: client.generateAuthUrl({
        access_type: 'online', scope: ['openid', 'email', 'profile'], prompt: 'select_account',
        state: flow.state, nonce: flow.nonce, code_challenge: codeChallenge, code_challenge_method: 'S256',
      }) };
    },
    async complete(code, flow) {
      const { tokens } = await client.getToken({ code, codeVerifier: flow.codeVerifier });
      fail(typeof tokens.id_token === 'string', 'MISSING_GOOGLE_ID_TOKEN', 401);
      // Google's maintained verifier checks signature, audience, issuer and token lifetime.
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.login.clientId });
      return validateGoogleClaims(ticket.getPayload(), flow.nonce);
      // Access/refresh tokens from end-user sign-in are deliberately not persisted.
    },
  };
}
