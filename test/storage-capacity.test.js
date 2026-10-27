import test from 'node:test';
import assert from 'node:assert/strict';
import {googleStore} from '../src/google-store.js';
import {readConfig} from '../src/config.js';
import schema from '../src/schema.json' with {type:'json'};
import {createApp} from '../src/app.js';
import {sessionCodec} from '../src/session.js';
import {createServer} from 'node:http';
import {reviewerFixture} from './fixtures/mou-write-data.js';
function capacityFixture(){
 const meta={sheets:Object.entries(schema).map(([title,c])=>({properties:{title,gridProperties:{rowCount:c.maxRows+1,columnCount:c.headers.length}}}))},keys={},headers={},calls=[];
 const store=googleStore(readConfig({}),{request:async req=>{calls.push(req);const u=new URL(req.url);if(!u.pathname.endsWith('values:batchGet'))return {data:meta};return {data:{valueRanges:u.searchParams.getAll('ranges').map(range=>{const name=range.split("'")[1];return {values:range.includes('1:')?[headers[name]||schema[name].headers]:keys[name]||[]};})}};}}).forRequest();return {store,keys,headers,meta,calls};
}
test('capacity warns by last key position despite gaps, keeps counts private and bounds GET batches',async()=>{
 const f=capacityFixture();f.keys.mou_progress=Array.from({length:4500},(_,i)=>i===4499?['PRIVATE_KEY_CANARY']:[]);f.keys.audit_log=Array.from({length:15000},(_,i)=>['a'+i]);
 assert.equal(typeof f.store.capacity,'function');const report=await f.store.capacity(),mou=report.tables.find(r=>r.name==='mou_progress'),audit=report.tables.find(r=>r.name==='audit_log');
 assert.equal(mou.records,1);assert.equal(mou.lastKeyRow,4500);assert.equal(mou.remainingUpperBound,500);assert.equal(mou.status,'critical');assert.equal(audit.status,'warning');assert.ok(!JSON.stringify(report).includes('PRIVATE_KEY_CANARY'));assert.equal(report.tables.length,25);assert.ok(f.calls.length<=6);assert.ok(f.calls.every(r=>r.method==='GET'&&!r.body));
 for(const req of f.calls){const ranges=new URL(req.url).searchParams.getAll('ranges');assert.ok(ranges.length<=12);for(const range of ranges)assert.match(range,/^'[a-z0-9_]+'!(A1:[A-Z]+1|[A-Z]+2:[A-Z]+\d+)$/);}
});
test('capacity reports oversized grids, missing tables and invalid keys without false zero success',async()=>{
 const f=capacityFixture();f.meta.sheets.find(s=>s.properties.title==='audit_log').properties.gridProperties.rowCount=50000;f.meta.sheets=f.meta.sheets.filter(s=>s.properties.title!=='notifications');f.headers.users=['bad'];f.keys.files=[['duplicate'],['duplicate']];const report=await f.store.capacity(),find=n=>report.tables.find(t=>t.name===n);
 assert.equal(find('audit_log').status,'blocked');assert.equal(find('audit_log').truncated,true);assert.equal(find('audit_log').remainingUpperBound,0);assert.equal(find('notifications').status,'missing');assert.equal(find('notifications').records,null);assert.equal(find('users').status,'invalid');assert.equal(find('files').status,'invalid');assert.equal(find('files').records,null);
 assert.ok(!f.calls.flatMap(r=>new URL(r.url).searchParams.getAll('ranges')).some(r=>r.includes('50000')));
});
test('capacity HTML and JSON require a fresh active admin before any scan and reject parameters',async t=>{
 const data=reviewerFixture(),config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake'}),codec=sessionCodec(config);let scans=0;const report={checkedAt:'2026-10-27T00:00:00Z',allocatedCells:100,tables:[{name:'audit_log',limit:20000,allocatedRows:20001,records:18000,lastKeyRow:18000,remainingUpperBound:2000,percent:90,status:'critical',truncated:false}]};
 const server=createServer(createApp(config,{codec,store:{table:async n=>data[n]||[],capacity:async()=>{scans++;return report;}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));config.origin='http://127.0.0.1:'+server.address().port;t.after(()=>{server.closeAllConnections();server.close();});const cookie=async subject=>(await codec.issue('session',{provider:'google',subject,csrf:'token'},900)).cookie.split(';')[0],admin=await cookie('admin-sub'),reviewer=await cookie('reviewer-sub');
 const get=(path,session='')=>fetch(config.origin+path,{headers:{cookie:session},redirect:'manual'});
 assert.equal((await get('/api/admin/storage-capacity')).status,401);assert.equal((await get('/admin/storage',reviewer)).status,403);assert.equal(scans,0);assert.equal((await get('/api/admin/storage-capacity?table=users',admin)).status,400);assert.equal(scans,0);
 const html=await(await get('/admin/storage',admin)).text();assert.match(html,/ความจุ/);assert.match(html,/audit_log/);assert.match(html,/90%/);assert.match(html,/ไม่ลบ/);const json=await get('/api/admin/storage-capacity',admin);assert.equal(json.headers.get('cache-control'),'no-store');assert.deepEqual(await json.json(),report);assert.equal(scans,2);
 data.users.find(u=>u.id==='u2').account_status='disabled';assert.equal((await get('/api/admin/storage-capacity',admin)).status,403);assert.equal(scans,2);
});

test('capacity thresholds include exact 75/90/100 boundaries and do not treat allocated empty rows as consumed data',async()=>{
 const f=capacityFixture();f.keys.users=Array.from({length:749},(_,i)=>['u'+i]);f.keys.registration_requests=Array.from({length:750},(_,i)=>['r'+i]);f.keys.identities=Array.from({length:900},(_,i)=>['i'+i]);f.keys.mou_settings=Array.from({length:100},(_,i)=>['s'+i]);const report=await f.store.capacity(),find=n=>report.tables.find(r=>r.name===n);assert.equal(find('users').status,'ready');assert.equal(find('registration_requests').status,'warning');assert.equal(find('identities').status,'critical');assert.equal(find('mou_settings').status,'full');assert.equal(find('mou_settings').remainingUpperBound,0);assert.equal(find('audit_log').status,'ready');assert.equal(find('audit_log').records,0);
});
