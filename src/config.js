import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fail } from './errors.js';

export function readConfig(env = process.env) {
  const origin = new URL(env.APP_ORIGIN || 'http://127.0.0.1:3000');
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname);
  fail(!origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash,
    'INVALID_APP_ORIGIN');
  fail(origin.protocol === 'https:' || local && origin.protocol === 'http:', 'HTTPS_REQUIRED');
  const sessionKey = env.SESSION_KEY_HEX || '';
  if (sessionKey) fail(/^[a-f\d]{64}$/i.test(sessionKey), 'INVALID_SESSION_KEY');
  const config = {
    origin: origin.origin, local, secure: origin.protocol === 'https:', sessionKey,
    login: { clientId: env.GOOGLE_LOGIN_CLIENT_ID || '', clientSecret: env.GOOGLE_LOGIN_CLIENT_SECRET || '' },
    storage: {
      clientId: env.GOOGLE_STORAGE_CLIENT_ID || '', clientSecret: env.GOOGLE_STORAGE_CLIENT_SECRET || '',
      refreshToken: env.GOOGLE_STORAGE_REFRESH_TOKEN || '',
    },
    ownerEmail: env.GOOGLE_OWNER_EMAIL || 'dh.satun@gmail.com',
    writer:{enabled:env.MOU_WRITES_ENABLED==='1',url:env.MOU_WRITER_URL||'',secret:env.MOU_WRITER_SECRET||''},
    moduleWrites:env.MODULE_WRITES_ENABLED==='1',
    ai:{enabled:env.AI_ENABLED==='1',freeConfirmed:env.AI_FREE_CONFIRMED==='1',key:env.MISTRAL_API_KEY||''},
    telegram:{enabled:env.TELEGRAM_ENABLED==='1',confirmed:env.TELEGRAM_DESTINATION_CONFIRMED==='1',token:env.TELEGRAM_BOT_TOKEN||'',chatId:env.TELEGRAM_CHAT_ID||'',botName:env.TELEGRAM_BOT_NAME||'',chatTitle:env.TELEGRAM_CHAT_TITLE||'',deadline:env.ASSESSMENT_DEADLINE||''},
    cronSecret:env.CRON_SECRET||'',
    cronDeploymentHost:env.VERCEL_ENV==='production'&&/^[a-z0-9-]+\.vercel\.app$/.test(env.VERCEL_URL||'')?env.VERCEL_URL:'',
    evidence:{enabled:env.EVIDENCE_WRITES_ENABLED==='1',refreshToken:env.GOOGLE_EVIDENCE_REFRESH_TOKEN||''},
    applicationSheetId: env.GOOGLE_APP_SHEET_ID || '1dWXmgRRg1yP39OSxl2PmFarlH1xAi1gaKy-rJc4Ve7k',
    referenceSheetId: env.GOOGLE_REFERENCE_SHEET_ID || '10UtjMGPnBKeMasgtrwYs3SPbqSu-f_RIhPU2tHYAaJw',
    evidenceFolderId: env.GOOGLE_EVIDENCE_FOLDER_ID || '1d3PzVAq2dY7dToKVYHMq6IjBRLC7oMOi',
  };
  for (const id of [config.applicationSheetId, config.referenceSheetId, config.evidenceFolderId]) {
    fail(/^[A-Za-z0-9_-]{10,200}$/.test(id), 'INVALID_RESOURCE_ID');
  }
  if(config.writer.url)fail(/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/.test(config.writer.url),'INVALID_WRITER_URL');
  if(config.writer.secret)fail(/^[a-f0-9]{64}$/.test(config.writer.secret),'INVALID_WRITER_SECRET');
  if(config.writer.enabled)fail(config.writer.url&&config.writer.secret,'WRITER_NOT_CONFIGURED');
  return config;
}

export function readiness(config) {
  return {
    loginConfigured: Boolean(config.sessionKey && config.login.clientId && config.login.clientSecret),
    storageConfigured: Boolean(config.storage.clientId && config.storage.clientSecret && config.storage.refreshToken),
  };
}

async function optionalJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw new Error('INVALID_LOCAL_CREDENTIAL_FILE'); }
}

// Only the local startup/CLI reads these files. Production uses secret environment variables.
export async function loadLocalEnvironment(directory = process.cwd(), environment = process.env) {
  const env = { ...environment };
  if (environment.NODE_ENV === 'production' || environment.VERCEL) return env;
  const web = (await optionalJson(resolve(directory, '.secrets/google-login-client.json')))?.web;
  const desktop = (await optionalJson(resolve(directory, '.secrets/google-storage-client.json')))?.installed;
  const token = await optionalJson(resolve(directory, '.secrets/google-storage-token.json'));
  const localSession = await optionalJson(resolve(directory, '.secrets/local-session.json'));
  const writer = await optionalJson(resolve(directory, '.secrets/mou-writer.json'));
  const evidence = await optionalJson(resolve(directory, '.secrets/google-evidence-token.json'));
  const evidenceFolder = await optionalJson(resolve(directory, '.secrets/evidence-folder.json'));
  const integrations = await optionalJson(resolve(directory, '.secrets/integrations.json'));
  if(integrations){env.MISTRAL_API_KEY ||= integrations.mistralKey;env.TELEGRAM_BOT_TOKEN ||= integrations.telegramToken;env.TELEGRAM_CHAT_ID ||= integrations.telegramChatId;}
  if(evidence){fail(evidence.ownerEmail===(env.GOOGLE_OWNER_EMAIL||'dh.satun@gmail.com'),'WRONG_TOKEN_OWNER');env.GOOGLE_EVIDENCE_REFRESH_TOKEN ||= evidence.refreshToken;}
  if(evidenceFolder)env.GOOGLE_EVIDENCE_FOLDER_ID ||= evidenceFolder.id;
  if(writer){env.MOU_WRITER_URL ||= writer.url;env.MOU_WRITER_SECRET ||= writer.secret;}
  env.SESSION_KEY_HEX ||= localSession?.key;
  if (web) {
    env.GOOGLE_LOGIN_CLIENT_ID ||= web.client_id;
    env.GOOGLE_LOGIN_CLIENT_SECRET ||= web.client_secret;
  }
  if (desktop) {
    env.GOOGLE_STORAGE_CLIENT_ID ||= desktop.client_id;
    env.GOOGLE_STORAGE_CLIENT_SECRET ||= desktop.client_secret;
  }
  if(evidence)fail(evidence.clientId===env.GOOGLE_STORAGE_CLIENT_ID,'WRONG_TOKEN_CLIENT');
  if (token) {
    fail(token.ownerEmail === (env.GOOGLE_OWNER_EMAIL || 'dh.satun@gmail.com'), 'WRONG_TOKEN_OWNER');
    fail(token.clientId === env.GOOGLE_STORAGE_CLIENT_ID, 'WRONG_TOKEN_CLIENT');
    env.GOOGLE_STORAGE_REFRESH_TOKEN ||= token.refreshToken;
  }
  return env;
}
