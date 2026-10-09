// Run in the owner's normal PowerShell; prints only paths, checksums and aggregate counts.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {referenceSshArgs} from './reference-ssh-options.js';
import {MOU_HOSPITAL_IDS} from '../src/mou-reference.js';
import {referenceImportPlan} from '../src/reference-import-plan.js';
import {mouProgressImportPlan} from '../src/mou-progress-import-plan.js';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function main(){
 if(process.argv.length!==5)throw Error('MOU_EXPORT_USAGE: node scripts/export-mou-progress-local.js SSH_USERNAME PRIVATE_KEY REFERENCE_JSON');
 const [user,key,referencePath]=process.argv.slice(2),args=referenceSshArgs(user,key);
 if(!(await stat(resolve(key))).isFile())throw Error('SSH_PRIVATE_KEY_FILE_UNAVAILABLE');
 const referenceBody=await readFile(resolve(referencePath),'utf8'),reference=JSON.parse(referenceBody);
 referenceImportPlan(reference);
 const template=await readFile(resolve(project,'scripts/export-mou-progress.php'),'utf8');
 if(template.split('__PROJECT_IDS_JSON__').length!==2)throw Error('MOU_EXPORT_TEMPLATE_INVALID');
 const php=template.replace('__PROJECT_IDS_JSON__',JSON.stringify(MOU_HOSPITAL_IDS));
 const ssh=process.platform==='win32'?resolve(process.env.SystemRoot||'C:\\Windows','System32/OpenSSH/ssh.exe'):'ssh';
 const result=spawnSync(ssh,args,{input:php,encoding:'utf8',maxBuffer:32*1024*1024,timeout:60000,windowsHide:true});
 if(result.status!==0){
  const error=String(result.stderr||'');
  if(/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(error))throw Error('SSH_HOST_KEY_REQUIRES_OWNER_CHECK');
  if(/Permission denied|publickey/i.test(error))throw Error('SSH_ACCOUNT_OR_KEY_NOT_READY');
  throw Error('MOU_PROGRESS_EXPORT_FAILED');
 }
 const data=JSON.parse(result.stdout),plan=mouProgressImportPlan(data,reference);
 const folder=resolve(project,'.migration');await mkdir(folder,{recursive:true});
 const output=resolve(folder,'mou-progress-2569-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
 const body=JSON.stringify(data,null,2)+'\n';await writeFile(output,body,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({file:output,sha256:createHash('sha256').update(body).digest('hex'),referenceSha256:createHash('sha256').update(referenceBody).digest('hex'),...plan.summary},null,2));
 console.log('Private migration snapshot. No Sheets writes, production changes, file downloads or account grants. Do not upload the JSON to GitHub or chat.');
}
main().catch(error=>{const message=String(error.message||'');const safe=/^(MOU_EXPORT_[A-Z_]+|MOU_PROGRESS_EXPORT_FAILED|SSH_[A-Z_]+)$/.test(message)||message.startsWith('MOU_EXPORT_USAGE:');console.error(safe?message:'MOU_PROGRESS_VALIDATION_OR_STORAGE_FAILED: no record contents or credentials printed.');process.exitCode=1;});
