import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/portal-session.js',import.meta.url),'utf8');
function harness(){
 const docEvents={},winEvents={},posts=[],csrf={value:'old-csrf'},requestId={value:'same-request-id'},message={textContent:''},title={textContent:''},button={disabled:false,addEventListener(){}},form={querySelector:()=>requestId,matches:()=>true};
 const banner={hidden:true,dataset:{},setAttribute(){},querySelector:s=>s.includes('message')?message:s.includes('title')?title:button};
 const document={hidden:false,body:{prepend(){}},querySelector:s=>s==='meta[name="portal-session"]'?{content:'signed-context',dataset:{expires:String(Date.now()+900000)}}:s==='main'?{prepend(){}}:form,querySelectorAll:s=>s==='input[name="csrf"]'?[csrf]:[form],createElement:()=>banner,addEventListener:(name,fn)=>{docEvents[name]=fn;}};
 const state={mode:'ready',failWrite:false,editWhileWriting:false};
 const edit=()=>docEvents.input({target:{closest:()=>form}});
 const window={addEventListener:(name,fn)=>{winEvents[name]=fn;},fetch:async(path,options)=>{
  if(path==='/api/session/recover')return Response.json(state.mode==='ready'?{ok:true,csrf:'fresh-csrf',expiresAt:Date.now()+900000}:{error:state.mode==='other'?'RECOVERY_ACCOUNT_MISMATCH':'SIGN_IN_REQUIRED'},{status:state.mode==='ready'?200:state.mode==='other'?403:401});
  posts.push(JSON.parse(options.body));if(state.editWhileWriting){state.editWhileWriting=false;edit();}if(state.failWrite){state.failWrite=false;throw Error('NETWORK_OUTCOME_UNKNOWN');}return Response.json({ok:true});
 }};
 vm.runInNewContext(source,{document,window,location:{origin:'https://portal.test',href:'https://portal.test/mou/action'},URL,Response,AbortSignal,Date,Set,Map,WeakMap,JSON,Number,String,Error,setInterval(){}});
 const guard=()=>{let prevented=false;winEvents.beforeunload({preventDefault(){prevented=true;}});return prevented;};
 return {session:window.PortalSession,state,posts,csrf,message,banner,edit,guard};
}
const options=()=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf:'old-csrf',requestId:'same-request-id',expectedVersion:7,detail:'ร่างที่ต้องเก็บไว้'})});
test('new CSRF changes only transport metadata, preserving the idempotency key and version on retry',async()=>{
 const f=harness();f.edit();f.state.failWrite=true;
 await assert.rejects(f.session.request('/api/mou/write',options()),/NETWORK_OUTCOME_UNKNOWN/);
 assert.equal(f.guard(),true);
 await f.session.request('/api/mou/write',options());assert.equal(f.posts.length,2);assert.deepEqual(f.posts[0],f.posts[1]);
 assert.equal(f.posts[1].csrf,'fresh-csrf');assert.equal(f.posts[1].requestId,'same-request-id');assert.equal(f.posts[1].expectedVersion,7);assert.equal(f.posts[1].detail,'ร่างที่ต้องเก็บไว้');assert.equal(f.guard(),false);
});
test('expired or different-account sessions send no write and retain the unsaved-form guard',async()=>{
 for(const mode of ['expired','other']){const f=harness();f.edit();f.state.mode=mode;const response=await f.session.request('/api/mou/write',options());assert.equal(response.status,401);assert.equal(f.posts.length,0);assert.equal(f.guard(),true);assert.equal(f.csrf.value,'old-csrf');if(mode==='other')assert.equal(f.banner.dataset.state,'blocked');}
});
test('edits made after a write began are not marked saved when an old uncertain request is replayed',async()=>{
 const f=harness();f.edit();f.state.failWrite=true;f.state.editWhileWriting=true;
 await assert.rejects(f.session.request('/api/mou/write',options()));await f.session.request('/api/mou/write',options());assert.equal(f.guard(),true);
});
test('upload completion does not clear the assessment draft before the actual save',async()=>{
 const f=harness();f.edit();await f.session.request('/api/files/finish',options());assert.equal(f.guard(),true);
});
