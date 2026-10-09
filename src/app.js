import {privacyPage} from './privacy-page.js';
import {normalizeModuleCommand,requireModuleUnit} from './module-rules.js';
import {loadModule,modulePage,moduleActionPage} from './module-page.js';
import {normalizeRegistrationCommand} from './registration-rules.js';
import {registrationPage,registrationAdminPage} from './registration-page.js';
import {MOU_HOSPITAL_IDS} from './mou-reference.js';
import {loadReviewQueue,reviewQueuePage} from './review-queue.js';
import {reviewProfile,requireReviewerScope} from './review-access.js';
import { readFile } from 'node:fs/promises';
import { readiness } from './config.js';
import { sessionCodec, equalToken, randomToken } from './session.js';
import { googleLogin } from './google-login.js';
import { googleStore } from './google-store.js';
import { resolveAccess, assessments, requireHospital } from './authorization.js';
import { fail, PortalError } from './errors.js';
import { page } from './page.js';
import { workspacePage } from './workspace-page.js';
import { loadMouWorkspace } from './mou-read.js';
import { loadMouHistory } from './mou-history-read.js';
import { readOnlyPage } from './read-only-page.js';
import {normalizeMouCommand} from './mou-write-rules.js';
import {mouWriterClient,writerConfigured} from './mou-writer-client.js';
import {mouActionPage} from './mou-action-page.js';

const style = readFile(new URL('../public/styles.css', import.meta.url), 'utf8');
const workspaceAssets = new Map(['workspace.css','workspace.js','demo-model.js','read-only.css','mou-history.css','mou-action.css','mou-action.js','registration.js','modules.css','module-action.js','account.js'].map(name => ['/'+name, {body:readFile(new URL('../public/'+name, import.meta.url),'utf8'),type:name.endsWith('.css')?'text/css':'text/javascript'}]));
function one(params, key) {
  fail(params.getAll(key).length <= 1, 'DUPLICATE_PARAMETER', 400);
  return params.get(key);
}
async function formBody(req) {
  if (req.body && typeof req.body === 'object') return new URLSearchParams(req.body);
  if (typeof req.body === 'string') { fail(req.body.length <= 4096, 'BODY_TOO_LARGE', 413); return new URLSearchParams(req.body); }
  let body = '';
  for await (const chunk of req) { body += chunk; fail(Buffer.byteLength(body) <= 4096, 'BODY_TOO_LARGE', 413); }
  return new URLSearchParams(body);
}
async function writeBody(req){
  fail((req.headers['content-type']||'').split(';')[0].trim()==='application/json','JSON_REQUIRED',415);
  let body=req.body;
  if(body==null){body='';for await(const chunk of req){body+=chunk;fail(Buffer.byteLength(body)<=50000,'BODY_TOO_LARGE',413);}}
  if(typeof body==='string'){fail(Buffer.byteLength(body)<=50000,'BODY_TOO_LARGE',413);try{body=JSON.parse(body);}catch{throw new PortalError('INVALID_JSON',400);}}
  fail(body&&typeof body==='object'&&!Array.isArray(body)&&Buffer.byteLength(JSON.stringify(body))<=50000,'INVALID_JSON',400);
  return body;
}

export function createApp(config, dependencies = {}) {
  const codec = dependencies.codec || sessionCodec(config);
  const login = dependencies.login || googleLogin(config);
  const rootStore = dependencies.store || googleStore(config);
  const writer = dependencies.writer || mouWriterClient(config);
  const ready = readiness(config);
  return async function handle(req, res) {
    const store = rootStore.forRequest ? rootStore.forRequest() : rootStore;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    function json(status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
    function redirect(location) { res.writeHead(303, { Location: location }); res.end(); }
    try {
      fail(req.headers.host === new URL(config.origin).host, 'INVALID_HOST', 400);
      fail(typeof req.url === 'string' && req.url.startsWith('/') && !req.url.startsWith('//'), 'INVALID_URL', 400);
      const url = new URL(req.url, config.origin);
      fail(url.origin === config.origin, 'INVALID_URL', 400);
      if(req.method==='GET'&&url.pathname==='/privacy'){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(privacyPage());
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return json(200, { service: 'standard-portal', mode: writerConfigured(config)?'mou-write-staging':'read-only-staging', liveMigration: false });
      if (req.method === 'GET' && url.pathname === '/styles.css') {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' }); return res.end(await style);
      }
      if (req.method === 'GET' && workspaceAssets.has(url.pathname)) {
        const asset=workspaceAssets.get(url.pathname);
        res.writeHead(200, {'Content-Type':asset.type+'; charset=utf-8'}); return res.end(await asset.body);
      }
      if (req.method === 'GET' && ['/demo/dashboard','/demo/mou'].includes(url.pathname) && config.local) {
        res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
        res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
        return res.end(workspacePage(url.pathname.endsWith('/mou')?'mou':'dashboard', true));
      }
      if (req.method === 'GET' && url.pathname === '/auth/google') {
        fail(ready.loginConfigured, 'LOGIN_NOT_CONFIGURED');
        const { flow, url: authorizationUrl } = await login.begin();
        res.setHeader('Set-Cookie', (await codec.issue('flow', flow, 600)).cookie);
        return redirect(authorizationUrl);
      }
      if (req.method === 'GET' && url.pathname === '/auth/google/callback') {
        res.setHeader('Set-Cookie', codec.clear('flow'));
        fail(ready.loginConfigured, 'LOGIN_NOT_CONFIGURED');
        const flow = await codec.read('flow', req.headers.cookie);
        fail(flow && equalToken(flow.state, one(url.searchParams, 'state')), 'INVALID_OAUTH_STATE', 400);
        fail(!one(url.searchParams, 'error'), 'GOOGLE_SIGN_IN_CANCELLED', 400);
        const code = one(url.searchParams, 'code');
        fail(code && code.length <= 4096, 'INVALID_AUTHORIZATION_CODE', 400);
        let identity;
        try { identity = await login.complete(code, flow); }
        catch { throw new PortalError('GOOGLE_SIGN_IN_FAILED', 401); }
        const issued = await codec.issue('session', { ...identity, csrf: randomToken() }, 900);
        res.setHeader('Set-Cookie', [codec.clear('flow'), issued.cookie]);
        return redirect('/');
      }
      const identity = await codec.read('session', req.headers.cookie);
      if (req.method === 'POST' && url.pathname === '/auth/logout') {
        fail(req.headers.origin === config.origin, 'INVALID_ORIGIN', 403);
        fail(identity, 'SIGN_IN_REQUIRED', 401);
        fail(equalToken(identity.csrf, one(await formBody(req), 'csrf')), 'INVALID_CSRF', 403);
        res.setHeader('Set-Cookie', [codec.clear('session'), codec.clear('flow')]);
        return redirect('/');
      }
      if(req.method==='POST'&&url.pathname==='/api/assessment/write'){
        fail(config.moduleWrites&&writerConfigured(config),'WRITES_DISABLED');
        fail(req.headers.origin===config.origin,'INVALID_ORIGIN',403);fail(identity,'SIGN_IN_REQUIRED',401);
        const {csrf,...input}=await writeBody(req);fail(equalToken(identity.csrf,csrf),'INVALID_CSRF',403);
        const command=normalizeModuleCommand(input);fail(ready.storageConfigured,'STORAGE_NOT_CONFIGURED');
        const access=await resolveAccess(identity,store);fail(access.status==='active','APPROVAL_REQUIRED',403);
        requireModuleUnit({mou_agencies:await store.table('mou_agencies')},{role:access.user.role,hospital_id:access.user.hospitalId},command.module,command.hospitalId,command.action==='review');
        return json(200,await writer.execute(identity,command,'assessment'));
      }
      if(req.method==='POST'&&url.pathname==='/api/registration'){
        fail(writerConfigured(config),'WRITES_DISABLED');
        fail(req.headers.origin===config.origin,'INVALID_ORIGIN',403);fail(identity,'SIGN_IN_REQUIRED',401);
        const {csrf,...input}=await writeBody(req);fail(equalToken(identity.csrf,csrf),'INVALID_CSRF',403);
        const command=normalizeRegistrationCommand(input);fail(ready.storageConfigured,'STORAGE_NOT_CONFIGURED');
        if(command.action!=='register'){const access=await resolveAccess(identity,store);fail(access.status==='active'&&access.user.role==='admin','ADMIN_REQUIRED',403);}
        return json(200,await writer.execute(identity,command,'registration'));
      }
      if(req.method==='POST'&&url.pathname==='/api/mou/write'){
        fail(writerConfigured(config),'WRITES_DISABLED');
        fail(req.headers.origin===config.origin,'INVALID_ORIGIN',403);
        fail(identity,'SIGN_IN_REQUIRED',401);
        const {csrf,...input}=await writeBody(req);
        fail(equalToken(identity.csrf,csrf),'INVALID_CSRF',403);
        const command=normalizeMouCommand(input);
        fail(ready.storageConfigured,'STORAGE_NOT_CONFIGURED');
        const access=await resolveAccess(identity,store);
        fail(access.status==='active','APPROVAL_REQUIRED',403);
        requireHospital(access,command.hospitalId,command.fiscalYear);
        if(command.action==='review'){requireReviewerScope(access.user,command.hospitalId,command.fiscalYear);reviewProfile(await store.table('reviewer_profiles'),access.user.id);}
        else fail(access.user.role!=='reviewer','REVIEWER_SAVE_DENIED',403);
        return json(200,await writer.execute(identity,command));
      }
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(405, { error: 'WRITES_DISABLED' }); }
      if(['/ctam','/hait','/ctam/action','/hait/action'].includes(url.pathname)){
        if(!identity)return redirect('/');fail(ready.storageConfigured,'STORAGE_NOT_CONFIGURED');
        const access=await resolveAccess(identity,store),module=url.pathname.split('/')[1];
        const model=await loadModule(store,access,module,one(url.searchParams,'hospital_id'));
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
        let body;
        if(url.pathname.endsWith('/action')){
          fail(model.unit,'HOSPITAL_REQUIRED',400);const action=one(url.searchParams,'action')||'save';fail(['save','review'].includes(action),'INVALID_WRITE_COMMAND',400);
          const item=model.items.find(i=>i.id===one(url.searchParams,'item_id'));fail(item,'ITEM_NOT_FOUND',404);
          let reviewerName='';if(action==='review'){fail(access.user.role==='admin','ADMIN_REQUIRED',403);fail(model.progress.some(r=>r[model.def.itemKey]===item.id),'PROGRESS_NOT_FOUND',404);reviewerName=reviewProfile(await store.table('reviewer_profiles'),access.user.id).name;}
          body=moduleActionPage(model,item,{csrf:identity.csrf,action,enabled:config.moduleWrites&&writerConfigured(config),reviewerName});
        }else body=modulePage(model,config.moduleWrites&&writerConfigured(config));
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(body);
      }
      if(['/register','/admin/registrations'].includes(url.pathname)){
        if(!identity)return redirect('/');fail(ready.storageConfigured,'STORAGE_NOT_CONFIGURED');
        const adminPage=url.pathname==='/admin/registrations';
        if(adminPage){const access=await resolveAccess(identity,store);fail(access.status==='active'&&access.user.role==='admin','ADMIN_REQUIRED',403);}
        const rows=await store.table('registration_requests');
        const options={csrf:identity.csrf,enabled:writerConfigured(config),preview:dependencies.preview===true};
        const body=adminPage?registrationAdminPage(rows,await store.directory([...MOU_HOSPITAL_IDS]),options):registrationPage(identity,rows,options);
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(body);
      }
      if(url.pathname==='/mou/reviews'){
        if(!identity)return redirect('/');
        fail(ready.storageConfigured,'STORAGE_NOT_CONFIGURED');
        const access=await resolveAccess(identity,store);
        const model=await loadReviewQueue(store,access,one(url.searchParams,'year'));
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        return res.end(reviewQueuePage(model,{preview:dependencies.preview===true}));
      }
      if(url.pathname==='/mou/action'){
        if(!identity)return redirect('/');
        fail(ready.storageConfigured,'STORAGE_NOT_CONFIGURED');
        const access=await resolveAccess(identity,store);
        fail(access.status==='active','APPROVAL_REQUIRED',403);
        const action=one(url.searchParams,'action')||'save';fail(['save','review'].includes(action),'INVALID_WRITE_COMMAND',400);
        fail(action!=='review'||['admin','reviewer'].includes(access.user.role),'ADMIN_REQUIRED',403);
        fail(action!=='save'||access.user.role!=='reviewer','REVIEWER_SAVE_DENIED',403);
        const model=await loadMouWorkspace(store,access,{hospitalId:one(url.searchParams,'hospital_id'),year:one(url.searchParams,'year')});
        fail(model.unit,'HOSPITAL_REQUIRED',400);
        const item=model.items.find(i=>i.id===one(url.searchParams,'item_id'));fail(item,'ITEM_NOT_FOUND',404);
        if(action==='review'){fail(item.record,'PROGRESS_NOT_FOUND',404);requireReviewerScope(access.user,model.hospitalId,model.year);model.reviewerName=reviewProfile(await store.table('reviewer_profiles'),access.user.id).name;}
        else fail(access.user.role==='admin'||!item.lock,'ASSESSMENT_LOCKED',403);
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        return res.end(mouActionPage(model,item,{csrf:identity.csrf,action,enabled:writerConfigured(config),preview:dependencies.preview===true}));
      }
      if (['/mou/history','/api/admin/mou-history'].includes(url.pathname)) {
        if (!identity && url.pathname==='/mou/history') return redirect('/');
        fail(identity,'SIGN_IN_REQUIRED',401);
        fail(ready.storageConfigured,'STORAGE_NOT_CONFIGURED');
        const access=await resolveAccess(identity,store);
        fail(access.status==='active'&&['admin','reviewer'].includes(access.user?.role),'ADMIN_REQUIRED',403);
        const query={hospitalId:one(url.searchParams,'hospital_id'),year:one(url.searchParams,'year'),progressId:one(url.searchParams,'progress_id'),review:one(url.searchParams,'review'),page:one(url.searchParams,'page')};
        try {
          const model=await loadMouHistory(store,access,query);
          if(url.pathname.startsWith('/api/'))return json(200,model);
          res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
          return res.end(readOnlyPage('mou/history',model,{local:config.local,testPreview:dependencies.preview===true}));
        } catch(error) {
          if(url.pathname.startsWith('/api/')||error instanceof PortalError&&error.status<500)throw error;
          res.writeHead(503,{'Content-Type':'text/html; charset=utf-8'});
          return res.end(readOnlyPage('mou/history',null,{error:true,local:config.local}));
        }
      }
      if (['/dashboard','/mou'].includes(url.pathname)) {
        if (!identity) return redirect('/');
        fail(ready.storageConfigured,'STORAGE_NOT_CONFIGURED');
        const access=await resolveAccess(identity,store);
        fail(access.status==='active','APPROVAL_REQUIRED',403);
        const query={hospitalId:one(url.searchParams,'hospital_id'),year:one(url.searchParams,'year'),category:one(url.searchParams,'category'),filter:one(url.searchParams,'filter')};
        // Real read-only pages never load the synthetic fixture module or any client-side data code.
        try {
          const model=await loadMouWorkspace(store,access,query);
          model.writeEnabled=writerConfigured(config);
          res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
          return res.end(readOnlyPage(url.pathname.slice(1),model,{local:config.local,testPreview:dependencies.preview===true}));
        } catch(error) {
          if(error instanceof PortalError && error.status<500)throw error;
          res.writeHead(503, {'Content-Type':'text/html; charset=utf-8'});
          return res.end(readOnlyPage(url.pathname.slice(1),null,{error:true,local:config.local}));
        }
      }
      if (url.pathname === '/') {
        let access;
        if (identity) {
          access = { status: 'unavailable' };
          if (ready.storageConfigured) {
            try { access = await resolveAccess(identity, store); } catch { /* Fail closed while keeping logout usable. */ }
          }
        }
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(page({ ...ready, identity, access, writeEnabled:writerConfigured(config), csrf: identity?.csrf }));
      }
      if (!['/api/me', '/api/assessments', '/api/admin/storage-check'].includes(url.pathname)) return json(404, { error: 'NOT_FOUND' });
      fail(identity, 'SIGN_IN_REQUIRED', 401);
      fail(ready.storageConfigured, 'STORAGE_NOT_CONFIGURED');
      const access = await resolveAccess(identity, store);
      if (url.pathname === '/api/me') return json(200, {
        identity: { provider: identity.provider, subject: identity.subject, email: identity.email }, access,
      });
      if (url.pathname === '/api/admin/storage-check') {
        fail(access.status === 'active' && access.user.role === 'admin', 'ADMIN_REQUIRED', 403);
        return json(200, await store.verifyResources());
      }
      const module = one(url.searchParams, 'module') || '';
      const hospitalId = one(url.searchParams, 'hospital_id') || '';
      const fiscalYear = one(url.searchParams, 'fiscal_year');
      return json(200, { readOnly: true, module, hospitalId, rows: await assessments(store, access, module, hospitalId, fiscalYear) });
    } catch (error) {
      return json(error instanceof PortalError ? error.status : 503, {
        error: error instanceof PortalError ? error.code : 'SERVICE_UNAVAILABLE',
      });
    }
  };
}
