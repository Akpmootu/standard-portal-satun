// Owner-run only. The terminal receives hashes and counts, never record contents.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {referenceSshArgs} from './reference-ssh-options.js';
import {MOU_HOSPITAL_IDS} from '../src/mou-reference.js';
import {mouProgressImportPlan} from '../src/mou-progress-import-plan.js';
import {mouHistoryImportPlan} from '../src/mou-history-import-plan.js';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=body=>createHash('sha256').update(body).digest('hex');
async function main(){
 if(process.argv.length!==6)throw Error('MOU_HISTORY_USAGE: node scripts/export-mou-history-local.js SSH_USERNAME PRIVATE_KEY REFERENCE_JSON PROGRESS_JSON');
 const [user,key,refPath,progressPath]=process.argv.slice(2),args=referenceSshArgs(user,key);
 if(!(await stat(resolve(key))).isFile())throw Error('SSH_PRIVATE_KEY_FILE_UNAVAILABLE');
 const refBody=await readFile(resolve(refPath),'utf8'),progressBody=await readFile(resolve(progressPath),'utf8');
 const reference=JSON.parse(refBody),progress=JSON.parse(progressBody);
 mouProgressImportPlan(progress,reference);
 // Tie history to the exact successfully imported snapshot, not an arbitrary new export.
 const receipt=JSON.parse(await readFile(resolve(project,'.migration/mou-import-2569-receipt.json'),'utf8'));
 if(receipt.sourceSha256!==sha(progressBody)||receipt.referenceSha256!==sha(refBody)||receipt.verifiedRows!==progress.records.length||receipt.expectedRows!==receipt.verifiedRows||receipt.spreadsheetId!=='1dWXmgRRg1yP39OSxl2PmFarlH1xAi1gaKy-rJc4Ve7k'||receipt.sheetId!==246980154)throw Error('MOU_HISTORY_IMPORTED_SNAPSHOT_MISMATCH');
 const template=await readFile(resolve(project,'scripts/export-mou-history.php'),'utf8');
 if(template.split('__PROJECT_IDS_JSON__').length!==2)throw Error('MOU_HISTORY_TEMPLATE_INVALID');
 const php=template.replace('__PROJECT_IDS_JSON__',JSON.stringify(MOU_HOSPITAL_IDS));
 const ssh=process.platform==='win32'?resolve(process.env.SystemRoot||'C:\\Windows','System32/OpenSSH/ssh.exe'):'ssh';
 const result=spawnSync(ssh,args,{input:php,encoding:'utf8',maxBuffer:32*1024*1024,timeout:60000,windowsHide:true});
 if(result.status!==0){
  const message=String(result.stderr||'');
  if(/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(message))throw Error('SSH_HOST_KEY_REQUIRES_OWNER_CHECK');
  if(/Permission denied|publickey/i.test(message))throw Error('SSH_ACCOUNT_OR_KEY_NOT_READY');
  throw Error('MOU_HISTORY_EXPORT_FAILED');
 }
 const data=JSON.parse(result.stdout),plan=mouHistoryImportPlan(data,progress,reference);
 const folder=resolve(project,'.migration');await mkdir(folder,{recursive:true});
 const output=resolve(folder,'mou-history-2569-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
 const body=JSON.stringify(data,null,2)+'\n';await writeFile(output,body,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({file:output,sha256:sha(body),referenceSha256:sha(refBody),progressSha256:sha(progressBody),...plan.summary},null,2));
 console.log('Private history snapshot only. No Sheets writes, production changes, evidence downloads or account grants. Do not upload the JSON to GitHub or chat.');
}
main().catch(error=>{const message=String(error.message||'');const safe=/^(MOU_HISTORY_[A-Z_]+|SSH_[A-Z_]+)$/.test(message)||message.startsWith('MOU_HISTORY_USAGE:');console.error(safe?message:'MOU_HISTORY_VALIDATION_OR_STORAGE_FAILED: no record contents or credentials printed.');process.exitCode=1;});
