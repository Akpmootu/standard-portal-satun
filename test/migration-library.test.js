import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {migrationReader,archivePage,libraryFile} from '../src/migration-library.js';
import {createApp} from '../src/app.js';
import {readConfig} from '../src/config.js';
import {sessionCodec} from '../src/session.js';
import {writeFixture} from './fixtures/mou-write-data.js';
const admin={status:'active',user:{role:'admin'}},hospital={status:'active',user:{role:'hospital'}};
const catalog={assetFolderId:'privateFolder123',archive:{verified:true,spreadsheetId:'nativeArchive123',capturedAt:'2026-10-12T04:21:03Z',modifiedTime:'locked',tables:{hait_chapters:{rows:55,headers:['id','title']}}},files:[{slug:'ctam-guideline',mime_type:'application/pdf',original_filename:'guide.pdf'},{slug:'logo',mime_type:'image/png'}]};
test('archive refuses nonadmins and invalid table/page before reading private files',async()=>{
 let calls=0;const reader=migrationReader({storage:{}},catalog,{request:async()=>{calls++;}});
 await assert.rejects(reader.read(hospital,'hait_chapters'),{code:'ADMIN_REQUIRED'});
 await assert.rejects(reader.read({status:'pending'},'hait_chapters'),{code:'APPROVAL_REQUIRED'});
 await assert.rejects(reader.read(admin,'users!A1:Z'),{code:'UNKNOWN_ARCHIVE_TABLE'});
 await assert.rejects(reader.read(admin,'hait_chapters',3),{code:'INVALID_ARCHIVE_PAGE'});assert.equal(calls,0);
});
test('archive reads only a bounded page and rejects changes after verification',async()=>{
 const urls=[];let modified='locked';const client={request:async o=>{const u=new URL(o.url);urls.push(u);if(u.hostname==='www.googleapis.com')return {data:{modifiedTime:modified,trashed:false}};if(!u.pathname.endsWith('batchGet'))return {data:{sheets:[{properties:{title:'hait_chapters',gridProperties:{rowCount:56,columnCount:2}}}]}};assert.deepEqual(u.searchParams.getAll('ranges'),["'hait_chapters'!A1:B1","'hait_chapters'!A52:B56"]);return {data:{valueRanges:[{values:[['id','title']]},{values:Array.from({length:5},(_,i)=>[String(51+i),'<script>private</script>'])}]}};}};
 const r=migrationReader({storage:{}},catalog,client),m=await r.read(admin,'hait_chapters',2);assert.equal(m.rows.length,5);assert.equal(m.start,51);const html=archivePage(catalog,m);assert.ok(html.includes('&lt;script&gt;private&lt;/script&gt;'));assert.ok(!html.includes('<script>private'));
 modified='changed';await assert.rejects(r.read(admin,'hait_chapters'),{code:'ARCHIVE_CHANGED'});assert.equal(urls.length,4);
});
test('approved users can get manuals while archived identity assets remain admin only',()=>{
 assert.equal(libraryFile(catalog,hospital,'ctam-guideline').mime_type,'application/pdf');
 assert.throws(()=>libraryFile(catalog,hospital,'logo'),{code:'ADMIN_REQUIRED'});
 assert.throws(()=>libraryFile(catalog,{status:'pending'},'ctam-guideline'),{code:'APPROVAL_REQUIRED'});
 assert.throws(()=>libraryFile(catalog,admin,'../secret'),{code:'RESOURCE_NOT_FOUND'});
});
test('HTTP library and archive apply fresh login approval and admin checks',async t=>{
 const data=writeFixture(),config=readConfig({SESSION_KEY_HEX:'a'.repeat(64),GOOGLE_STORAGE_CLIENT_ID:'fake',GOOGLE_STORAGE_CLIENT_SECRET:'fake',GOOGLE_STORAGE_REFRESH_TOKEN:'fake'}),codec=sessionCodec(config);let archiveCalls=0;
 const server=createServer(createApp(config,{codec,store:{table:async n=>data[n]||[]},migrationCatalog:catalog,archive:{read:async()=>{archiveCalls++;return {name:'hait_chapters',label:'legacy',headers:['id'],rows:[['1']],page:1,pages:1,total:1,start:1};}},resourceDrive:{download:async()=>Buffer.from('%PDF-test')}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});config.origin='http://127.0.0.1:'+server.address().port;
 const cookie=async subject=>(await codec.issue('session',{provider:'google',subject,csrf:'csrf'},900)).cookie.split(';')[0];
 const own=await cookie('hospital-sub'),owner=await cookie('admin-sub'),get=(path,c='')=>fetch(config.origin+path,{headers:{cookie:c},redirect:'manual'});
 assert.equal((await get('/admin/archive')).status,303);assert.equal((await get('/admin/archive',own)).status,403);assert.equal(archiveCalls,0);
 assert.equal((await get('/resources',own)).status,200);assert.equal((await get('/resources/ctam-guideline',own)).status,200);assert.equal((await get('/resources/logo',own)).status,403);
 assert.equal((await get('/admin/archive',owner)).status,200);assert.equal(archiveCalls,1);
 data.users[1].account_status='disabled';assert.equal((await get('/admin/archive',owner)).status,403);assert.equal(archiveCalls,1);
});
