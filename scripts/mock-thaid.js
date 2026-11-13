// Local-only ThaID mock for testing the login button without real DOPA credentials.
// Listens on 127.0.0.1 only. Never use in production.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const port = Number(process.env.MOCK_THAID_PORT || 3901);
const clientId = process.env.THAID_CLIENT_ID || 'local-thaid-client';
const clientSecret = process.env.THAID_CLIENT_SECRET || 'local-thaid-secret';
const codes = new Map();
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Test citizen IDs with a valid checksum. Not real people.
const people = [['1101700203450', 'ทดสอบ ใจดี'], ['3910100012341', 'สมหญิง รักสตูล']];

function form(res, params) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="th"><meta charset="utf-8"><title>Mock ThaID</title>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto"><h1>Mock ThaID (ทดสอบในเครื่อง)</h1>
<p>เลือกผู้ใช้ทดสอบเพื่อจำลองการสแกน QR ด้วยแอป ThaID</p>
<form method="post" action="/api/v2/oauth2/auth/">${['client_id', 'redirect_uri', 'state', 'scope'].map(k => `<input type="hidden" name="${k}" value="${esc(params.get(k))}">`).join('')}
${people.map(([pid, name], i) => `<label style="display:block;margin:8px 0"><input type="radio" name="person" value="${i}" ${i ? '' : 'checked'}> ${esc(name)} (${pid})</label>`).join('')}
<button name="decision" value="allow">อนุญาต</button> <button name="decision" value="deny">ยกเลิก</button></form></body></html>`);
}

async function body(req) { let s = ''; for await (const c of req) { s += c; if (s.length > 8192) throw Error('too large'); } return new URLSearchParams(s); }

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/api/v2/oauth2/auth/' && req.method === 'GET') {
      if (url.searchParams.get('client_id') !== clientId || url.searchParams.get('response_type') !== 'code') { res.writeHead(400); return res.end('invalid_client'); }
      return form(res, url.searchParams);
    }
    if (url.pathname === '/api/v2/oauth2/auth/' && req.method === 'POST') {
      const p = await body(req), target = new URL(p.get('redirect_uri'));
      if (!['127.0.0.1', 'localhost'].includes(target.hostname)) { res.writeHead(400); return res.end('invalid_redirect'); }
      target.searchParams.set('state', p.get('state') || '');
      if (p.get('decision') !== 'allow') target.searchParams.set('error', 'access_denied');
      else {
        const code = randomBytes(16).toString('hex');
        codes.set(code, { person: people[Number(p.get('person')) || 0], redirectUri: p.get('redirect_uri'), at: Date.now() });
        target.searchParams.set('code', code);
      }
      res.writeHead(302, { Location: target.href }); return res.end();
    }
    if (url.pathname === '/api/v2/oauth2/token/' && req.method === 'POST') {
      const auth = Buffer.from(String(req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString();
      const p = await body(req), grant = codes.get(p.get('code'));
      codes.delete(p.get('code'));
      if (auth !== `${clientId}:${clientSecret}` || p.get('grant_type') !== 'authorization_code' || !grant || grant.redirectUri !== p.get('redirect_uri') || Date.now() - grant.at > 120000) {
        res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end('{"error":"invalid_grant"}');
      }
      const [pid, name] = grant.person, now = Math.floor(Date.now() / 1000);
      const idToken = ['{"alg":"none","typ":"JWT"}', JSON.stringify({ iss: 'mock-thaid', aud: clientId, iat: now, exp: now + 300, pid, name })]
        .map(s => Buffer.from(s).toString('base64url')).join('.') + '.';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ access_token: randomBytes(16).toString('hex'), token_type: 'Bearer', expires_in: 300, scope: 'pid name', id_token: idToken, pid, name }));
    }
    res.writeHead(404); res.end();
  } catch { res.writeHead(400); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Mock ThaID listening on http://127.0.0.1:${port} (client_id=${clientId})`));
