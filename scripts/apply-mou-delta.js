import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {readConfig,loadLocalEnvironment} from '../src/config.js';
import {googleStore} from '../src/google-store.js';
import {mouDeltaPlan} from '../src/mou-delta-plan.js';
import {mouWriterClient} from '../src/mou-writer-client.js';
try{
 const config=readConfig({...await loadLocalEnvironment(),MOU_WRITES_ENABLED:'1'}),store=googleStore(config).forRequest();
 const source=JSON.parse(await readFile(process.argv[2],'utf8')),tables={mou_progress:await store.table('mou_progress')};
 const plan=mouDeltaPlan(source,tables);if(plan.conflicts.length)throw Error('MIGRATION_CONFLICT_REVIEW_REQUIRED');
 const [links,users]=await Promise.all([store.table('identities'),store.table('users')]);
 const admins=links.filter(i=>i.email===config.ownerEmail&&i.provider==='google'&&i.status==='active'&&i.approved_by&&i.approved_at&&users.some(u=>u.id===i.legacy_user_id&&u.role==='admin'&&u.account_status==='active'));if(admins.length!==1)throw Error('NO_APPROVED_OWNER_ADMIN');
 const identity={provider:'google',subject:admins[0].provider_subject},writer=mouWriterClient(config),receipts=[];
 for(let start=0;start<plan.changes.length;start+=10){const command={requestId:randomUUID(),action:'import-mou',rows:plan.changes.slice(start,start+10)};await writeFile('.migration/delta-request-'+command.requestId+'.json',JSON.stringify(command),{flag:'wx',mode:0o600});receipts.push(await writer.execute(identity,command,'migration'));}
 // Read with fresh metadata: the writer may have expanded the grid while importing.
 const after=await googleStore(config).forRequest().table('mou_progress');for(const c of plan.changes){const actual=after.find(r=>r.id===c.record.id);if(!actual||Object.keys(c.record).some(k=>actual[k]!==c.record[k]))throw Error('READBACK_MISMATCH');}
 const result={...plan.summary,rowsVerified:plan.changes.length,receipts,sourceWrites:false,accountGrants:false};await writeFile('.migration/mou-delta-receipt.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
}catch(error){console.error('MOU_DELTA_FAILED: '+(['MIGRATION_CONFLICT_REVIEW_REQUIRED','NO_APPROVED_OWNER_ADMIN','READBACK_MISMATCH'].includes(error.message)?error.message:error.code||'PRIVATE_DETAILS_HIDDEN'));process.exitCode=1;}
