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

export function googleStore(config, injectedClient, requestMetadata = null) {
  const client = injectedClient || new OAuth2Client(config.storage.clientId, config.storage.clientSecret);
  if (!injectedClient) client.setCredentials({ refresh_token: config.storage.refreshToken });
  async function get(url) {
    fail(config.storage.refreshToken || injectedClient, 'STORAGE_NOT_CONFIGURED');
    // Only fixed Google GET endpoints are reachable; the browser never supplies a URL or sheet ID.
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return (await client.request({ url, method: 'GET', timeout: 8000, retry: false })).data; }
      catch (error) {
        const status = error.response?.status;
        if ([429, 500, 502, 503, 504].includes(status) && attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt));
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
    const meta = await metadata(config.applicationSheetId);
    const range = tableRange(name,meta);
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${config.applicationSheetId}/values/${encodeURIComponent(range)}`);
    url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE');
    return parseTable(name, (await get(url.href)).values || []);
  }
  async function tables(names) {
    // Fixed small set of reference tables only. Accounts and assessment rows stay separate.
    const allowed=['mou_categories','mou_items','mou_settings','mou_agencies'];
    fail(Array.isArray(names)&&names.length>0&&names.length<=4&&new Set(names).size===names.length&&names.every(n=>allowed.includes(n)),'INVALID_TABLE_BATCH',400);
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
  async function directory(ids) {
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
    for (const name of Object.keys(schema)) {
      const records = await table(name);
      checkedTables.push({ name, rows: records.length });
    }
    return { connected: true, privateResources: true, readOnly: true, checkedTables };
  }
  return { table, tables, directory, verifyResources, forRequest:()=>googleStore(config,client,new Map()) };
}
