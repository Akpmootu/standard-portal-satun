import { OAuth2Client } from 'google-auth-library';
import schema from './schema.json' with { type: 'json' };
import { fail, PortalError } from './errors.js';
import { HOSPITAL_HEADERS } from './mou-reference.js';

export const STORAGE_SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

function column(n) {
  let result = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
}

export function parseTable(name, values) {
  const contract = Object.hasOwn(schema,name) ? schema[name] : null;
  fail(contract, 'UNKNOWN_TABLE', 400);
  fail(Array.isArray(values) && JSON.stringify(values[0]) === JSON.stringify(contract.headers), 'SCHEMA_MISMATCH');
  fail(values.length <= contract.maxRows + 1, 'TABLE_LIMIT_EXCEEDED');
  const seen = new Set();
  return values.slice(1).filter(row => row.some(value => value !== '' && value != null)).map(row => {
    fail(row.length <= contract.headers.length, 'SCHEMA_MISMATCH');
    const record = Object.fromEntries(contract.headers.map((key, i) => [key, row[i] ?? '']));
    const id = record[contract.key || "id"];
    fail(typeof id === 'string' && id.length > 0 && !seen.has(id), 'INVALID_RECORD_ID');
    seen.add(id);
    for (const key of contract.headers.filter(key => key === 'id' || key.endsWith('_id') || key === 'provider_subject')) {
      fail(typeof record[key] === 'string', 'IDENTIFIER_NOT_TEXT');
    }
    return record;
  });
}

export function googleStore(config, injectedClient, requestMetadata = null, shared = {}) {
  const client = injectedClient || new OAuth2Client(config.storage.clientId, config.storage.clientSecret);
  if (!injectedClient) client.setCredentials({ refresh_token: config.storage.refreshToken });
  shared.clock ||= Date.now;
  shared.reads ||= [];
  shared.blockedUntil ||= 0;
  shared.units ||= new Map();
  shared.unitLoads ||= new Map();
  const requestTables = requestMetadata ? new Map() : null;
  let pending = [], scheduled = false;
  function quotaError() {
    const error = new PortalError('GOOGLE_QUOTA_EXCEEDED',503);
    error.retryAfter = Math.max(1,Math.ceil((shared.blockedUntil-shared.clock())/1000));
    return error;
  }
  async function get(url) {
    fail(config.storage.refreshToken || injectedClient, 'STORAGE_NOT_CONFIGURED');
    // Only fixed Google GET endpoints are reachable; the browser never supplies a URL or sheet ID.
    for (let attempt = 0; attempt < 3; attempt++) {
      const now=shared.clock(),sheets=new URL(url).hostname==='sheets.googleapis.com';
      if(sheets){
        if(now<shared.blockedUntil)throw quotaError();
        shared.reads=shared.reads.filter(time=>time>now-60000);
        // Per-process protection, leaving headroom for other Google clients.
        // Google still enforces the owner quota across all serverless instances.
        if(shared.reads.length>=45){shared.blockedUntil=shared.reads[0]+60000;throw quotaError();}
        shared.reads.push(now);
      }
      try { return (await client.request({ url, method: 'GET', timeout: 8000, retry: false })).data; }
      catch (error) {
        const status = error.response?.status;
        if(status===429&&sheets){
          const headers=error.response?.headers,raw=headers?.get?.('retry-after')??headers?.['retry-after'];
          const seconds=Number(raw),date=Date.parse(raw);
          const delay=Number.isFinite(seconds)&&seconds>0?seconds*1000:Number.isFinite(date)?date-shared.clock():60000;
          shared.blockedUntil=Math.max(shared.blockedUntil,shared.clock()+Math.max(60000,Math.min(120000,delay)));
          throw quotaError();
        }
        if ([500, 502, 503, 504].includes(status) && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt + Math.floor(Math.random()*250)));
          continue;
        }
        // Never log/return the upstream error: it may contain OAuth headers or client secrets.
        throw new PortalError(status === 429 ? 'GOOGLE_QUOTA_EXCEEDED' : 'GOOGLE_CONNECTION_FAILED');
      }
    }
  }
  async function metadata(sheetId) {
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`);
    url.searchParams.set('fields', 'spreadsheetId,sheets(properties(sheetId,title,gridProperties))');
    if (!requestMetadata) return get(url.href);
    // This map belongs to one HTTP request, never the process or another user.
    if (!requestMetadata.has(sheetId)) requestMetadata.set(sheetId, get(url.href));
    return requestMetadata.get(sheetId);
  }
  function tableRange(name, meta) {
    const contract = Object.hasOwn(schema,name) ? schema[name] : null;
    fail(contract, 'UNKNOWN_TABLE', 400);
    const tab = meta.sheets?.find(sheet => sheet.properties?.title === name)?.properties;
    fail(tab, 'MISSING_SHEET');
    const rows=tab.gridProperties?.rowCount;
    fail(Number.isInteger(rows)&&rows>=1&&rows<=contract.maxRows+1,'TABLE_LIMIT_EXCEEDED');
    return `'${name}'!A1:${column(contract.headers.length)}${rows}`;
  }
  async function table(name) {
    const contract = Object.hasOwn(schema,name) ? schema[name] : null;
    fail(contract, 'UNKNOWN_TABLE', 400);
    if(requestTables){
      if(!requestTables.has(name)){
        requestTables.set(name,new Promise((resolve,reject)=>pending.push({name,resolve,reject})));
        if(!scheduled){scheduled=true;queueMicrotask(flushTables);}
      }
      return requestTables.get(name);
    }
    const meta = await metadata(config.applicationSheetId);
    const range = tableRange(name,meta);
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${config.applicationSheetId}/values/${encodeURIComponent(range)}`);
    url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE');
    return parseTable(name, (await get(url.href)).values || []);
  }
  async function flushTables(){
    const jobs=pending;pending=[];scheduled=false;
    try{
      const meta=await metadata(config.applicationSheetId);
      // Bound each batch, even when a diagnostic requests every known table.
      for(let start=0;start<jobs.length;start+=12){
        const group=jobs.slice(start,start+12);
        const url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${config.applicationSheetId}/values:batchGet`);
        url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
        for(const job of group)url.searchParams.append('ranges',tableRange(job.name,meta));
        const data=await get(url.href);
        fail(Array.isArray(data.valueRanges)&&data.valueRanges.length===group.length,'SCHEMA_MISMATCH');
        const rows=group.map((job,i)=>parseTable(job.name,data.valueRanges[i].values||[]));
        group.forEach((job,i)=>job.resolve(rows[i]));
      }
    }catch(error){jobs.forEach(job=>job.reject(error));}
  }
  async function prefetch(names){
    fail(Array.isArray(names)&&names.length>0&&names.length<=32&&new Set(names).size===names.length&&names.every(name=>Object.hasOwn(schema,name)),'INVALID_TABLE_BATCH',400);
    await Promise.all(names.map(table));
  }
  async function tables(names) {
    // Fixed small set of reference tables only. Accounts and assessment rows stay separate.
    const allowed=['mou_categories','mou_items','mou_settings','mou_agencies'];
    fail(Array.isArray(names)&&names.length>0&&names.length<=4&&new Set(names).size===names.length&&names.every(n=>allowed.includes(n)),'INVALID_TABLE_BATCH',400);
    if(requestTables)return Promise.all(names.map(table));
    const meta=await metadata(config.applicationSheetId);
    const ranges=names.map(name=>tableRange(name,meta));
    const url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${config.applicationSheetId}/values:batchGet`);
    url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
    for(const range of ranges)url.searchParams.append('ranges',range);
    const data=await get(url.href);
    fail(Array.isArray(data.valueRanges)&&data.valueRanges.length===names.length,'SCHEMA_MISMATCH');
    // batchGet guarantees response order; every block still has its own exact header check.
    return names.map((name,i)=>parseTable(name,data.valueRanges[i].values||[]));
  }
  async function readDirectory(ids) {
    fail(Array.isArray(ids) && ids.length <= 100 && ids.every(id=>typeof id==='string' && /^\d{5}$/.test(id)), 'INVALID_HOSPITAL_ID',400);
    const wanted=new Set(ids);
    if(!wanted.size)return [];
    const meta=await metadata(config.referenceSheetId);
    const tab=meta.sheets?.find(s=>s.properties?.title==='c_hosoffice')?.properties;
    fail(tab,'MISSING_SHEET');
    const rows=tab.gridProperties?.rowCount;
    fail(Number.isInteger(rows) && rows>=2 && rows<=50001,'TABLE_LIMIT_EXCEEDED');
    async function rangesGet(ranges) {
      const url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${config.referenceSheetId}/values:batchGet`);
      url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
      for(const range of ranges)url.searchParams.append('ranges',range);
      const data=await get(url.href);
      fail(data.valueRanges?.length===ranges.length,'SCHEMA_MISMATCH');
      return data.valueRanges.map(r=>r.values||[]);
    }
    // Read headers and the ID column only; do not copy addresses or the entire national directory.
    const [headers,codes]=await rangesGet(["'c_hosoffice'!A1:AA1",`'c_hosoffice'!D2:D${rows}`]);
    fail(JSON.stringify(headers[0])===JSON.stringify(HOSPITAL_HEADERS),'SCHEMA_MISMATCH');
    fail(codes.length<=rows-1,'TABLE_LIMIT_EXCEEDED');
    const matches=[],seen=new Set();
    codes.forEach((row,index)=>{
      const code=row[0];if(code==null||code==='')return;
      fail(typeof code==='string','IDENTIFIER_NOT_TEXT');
      if(!wanted.has(code))return;
      fail(!seen.has(code),'AMBIGUOUS_HOSPITAL');seen.add(code);
      matches.push({id:code,row:index+2});
    });
    if(!matches.length)return [];
    const values=await rangesGet(matches.map(m=>`'c_hosoffice'!A${m.row}:G${m.row}`));
    return values.map((result,index)=>{
      const row=result[0];
      // Guard against concurrent row movement between code lookup and row read.
      fail(result.length===1 && row?.[3]===matches[index].id,'DIRECTORY_CHANGED_RETRY');
      fail(typeof row[0]==='string' && row[0].trim() && row[0].length<=500,'INVALID_HOSPITAL_NAME');
      return {id:row[3],name:row[0],type:String(row[6]||'')};
    });
  }
  async function directory(ids){
    fail(Array.isArray(ids)&&ids.length<=100&&ids.every(id=>typeof id==='string'&&/^\d{5}$/.test(id)),'INVALID_HOSPITAL_ID',400);
    const wanted=[...new Set(ids)];if(!wanted.length)return [];
    const now=shared.clock();
    for(const [id,entry] of shared.units)if(entry.expires<=now)shared.units.delete(id);
    const missing=wanted.filter(id=>!shared.units.has(id));
    if(missing.length){
      const key=[...missing].sort().join('|');
      if(!shared.unitLoads.has(key)){
        const load=readDirectory(missing).then(rows=>{
          for(const unit of rows){if(shared.units.size>=1000)shared.units.delete(shared.units.keys().next().value);shared.units.set(unit.id,{value:unit,expires:shared.clock()+300000});}
        });
        shared.unitLoads.set(key,load);load.finally(()=>shared.unitLoads.delete(key)).catch(()=>{});
      }
      await shared.unitLoads.get(key);
    }
    // Cache contains only id/name/type. It never contains accounts, roles or evidence.
    return wanted.flatMap(id=>shared.units.has(id)?[{...shared.units.get(id).value}]:[]);
  }
  async function resource(id) {
    const url = new URL(`https://www.googleapis.com/drive/v3/files/${id}`);
    url.searchParams.set('fields', 'id,mimeType,trashed,shared,owners(emailAddress),permissions(type,role,emailAddress)');
    return get(url.href);
  }
  async function verifyResources() {
    const profile = await get('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)');
    fail(profile.user?.emailAddress === config.ownerEmail, 'WRONG_STORAGE_OWNER');
    for (const [id, mime] of [
      [config.applicationSheetId, 'application/vnd.google-apps.spreadsheet'],
      [config.referenceSheetId, 'application/vnd.google-apps.spreadsheet'],
      [config.evidenceFolderId, 'application/vnd.google-apps.folder'],
    ]) {
      const file = await resource(id);
      fail(file.mimeType === mime && !file.trashed, 'INVALID_GOOGLE_RESOURCE');
      fail(file.shared === false && file.owners?.length === 1 && file.owners[0].emailAddress === config.ownerEmail,
        'RESOURCE_NOT_PRIVATE');
      fail(file.permissions?.length === 1 && file.permissions[0].role === 'owner'
        && file.permissions[0].emailAddress === config.ownerEmail, 'RESOURCE_NOT_PRIVATE');
    }
    const checkedTables = [];
    const scoped=googleStore(config,client,new Map(),shared);
    await scoped.prefetch(Object.keys(schema));
    for (const name of Object.keys(schema)) {
      const records = await scoped.table(name);
      checkedTables.push({ name, rows: records.length });
    }
    return { connected: true, privateResources: true, readOnly: true, checkedTables };
  }
  return { table, tables, ...(requestTables?{prefetch}:{}), directory, verifyResources, forRequest:()=>googleStore(config,client,new Map(),shared) };
}
