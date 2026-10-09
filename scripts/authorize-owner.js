import { createServer } from 'node:http';
import { OAuth2Client } from 'google-auth-library';
import { readConfig, loadLocalEnvironment } from '../src/config.js';
import { randomToken, equalToken } from '../src/session.js';
import { validateGoogleClaims } from '../src/google-login.js';
import { STORAGE_SCOPES } from '../src/google-store.js';
import { EVIDENCE_SCOPES } from '../src/evidence-drive.js';
import { privateDirectory, saveNewPrivateJson } from './private-files.js';
import { ownerAuthDiagnostic, ownerAuthResult } from './owner-auth-errors.js';
import { privateStorageCode } from './private-storage-errors.js';

async function main() {
  const config = readConfig(await loadLocalEnvironment());
  const evidenceMode=process.argv.includes('--evidence'),scopes=evidenceMode?EVIDENCE_SCOPES:STORAGE_SCOPES;
  if (!config.storage.clientId || !config.storage.clientSecret) throw new Error('MISSING_DESKTOP_CLIENT');
  // Fail before asking for consent if this Windows account cannot protect the saved token.
  try { await privateDirectory(); }
  catch (error) { throw Object.assign(new Error('PRIVATE_STORAGE_NOT_READY'), {code: privateStorageCode(error)}); }
  const redirectUri = 'http://127.0.0.1:8085/oauth2/callback';
  const client = new OAuth2Client({ clientId: config.storage.clientId, clientSecret: config.storage.clientSecret, redirectUri });
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const state = randomToken(), nonce = randomToken();
  const authorizationUrl = client.generateAuthUrl({
    access_type: 'offline', prompt: 'consent select_account', scope: scopes,
    state, nonce, code_challenge: codeChallenge, code_challenge_method: 'S256',
    login_hint: config.ownerEmail,
  });
  let consumed = false;
  let result = null;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (req.headers.host !== '127.0.0.1:8085' || req.method !== 'GET') { res.writeHead(400); return res.end('Invalid request'); }
    const url = new URL(req.url, 'http://127.0.0.1:8085');
    if (url.pathname === '/result') {
      res.writeHead(result && result !== 'SUCCESS' ? 400 : 200);
      return res.end(result ? ownerAuthResult(result) : 'กำลังรอผลการอนุญาต');
    }
    if (url.pathname === '/oauth2/callback' && consumed) {
      res.writeHead(303, { Location: '/result' }); return res.end();
    }
    if (url.pathname === '/start' && !consumed) { res.writeHead(303, { Location: authorizationUrl }); return res.end(); }
    if (url.pathname !== '/oauth2/callback' || consumed || url.searchParams.getAll('state').length !== 1
      || !equalToken(url.searchParams.get('state'), state)) { res.writeHead(400); return res.end('Invalid authorization state'); }
    consumed = true;
    let stage = 'consent';
    try {
      if (url.searchParams.has('error') || url.searchParams.getAll('code').length !== 1) throw new Error('CONSENT_NOT_COMPLETED');
      const code = url.searchParams.get('code');
      if (!code || code.length > 4096) throw new Error('INVALID_CODE');
      stage = 'exchange';
      const { tokens } = await client.getToken({ code, codeVerifier });
      if (!tokens.id_token || !tokens.refresh_token || !tokens.access_token) throw new Error('MISSING_TOKEN');
      stage = 'identity';
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.storage.clientId });
      const identity = validateGoogleClaims(ticket.getPayload(), nonce);
      stage = 'owner';
      if (identity.email !== config.ownerEmail) throw new Error('WRONG_OWNER');
      stage = 'scopes';
      const info = await client.getTokenInfo(tokens.access_token);
      for (const scope of scopes.filter(scope => scope.startsWith('https://'))) {
        if (!info.scopes.includes(scope)) throw new Error('MISSING_READ_SCOPE');
      }
      stage = 'save';
      await saveNewPrivateJson(evidenceMode?'google-evidence-token.json':'google-storage-token.json', {
        ownerEmail: identity.email, ownerSubject: identity.subject, clientId: config.storage.clientId,
        refreshToken: tokens.refresh_token, authorizedAt: new Date().toISOString(), scopes: info.scopes,
      });
      result = 'SUCCESS';
      console.log('Owner authorization saved privately. No tokens were printed. Run pnpm verify:google next.');
    } catch (error) {
      result = ownerAuthDiagnostic(stage, error);
      console.error(result);
      process.exitCode = 1;
    } finally {
      // Leave a clean, reloadable result page available for two minutes, without codes in its URL.
      clearTimeout(timer);
      timer = setTimeout(() => server.close(), 2 * 60 * 1000);
      res.writeHead(303, { Location: '/result' }); res.end();
    }
  });
  let timer = setTimeout(() => { server.close(); console.error('OWNER_AUTH_TIMED_OUT'); process.exitCode = 1; }, 5 * 60 * 1000);
  server.on('error', () => { clearTimeout(timer); console.error('OWNER_AUTH_SERVER_FAILED'); process.exitCode = 1; });
  server.listen(8085, '127.0.0.1', () => {
    console.log('Owner authorization requires your own browser consent.');
    console.log(evidenceMode?'Scope: drive.file — create and access only app-created or explicitly selected Drive files. Existing broad Drive access is not requested.':'Scopes can read spreadsheets and Drive file metadata in the owner account; the application restricts itself to configured project resources.');
    console.log('Open http://127.0.0.1:8085/start and choose dh.satun@gmail.com. Do not send tokens or secrets in chat.');
  });
}
main().catch(error => {
  console.error(error?.message === 'PRIVATE_STORAGE_NOT_READY'
    ? `OWNER_AUTH_${privateStorageCode(error)}: private storage setup stopped; no credentials printed.`
    : 'OWNER_AUTH_SETUP_REQUIRED: check local client configuration without sharing credentials.');
  process.exitCode = 1;
});
