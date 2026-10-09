// Run in the owner's normal terminal. SSH uses that account's existing keys, never reads them here.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {referenceImportPlan} from '../src/reference-import-plan.js';
import {referenceSshArgs} from './reference-ssh-options.js';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function main() {
 let user=process.argv[2];
 if(!user){const prompt=createInterface({input:process.stdin,output:process.stdout});try{user=await prompt.question('SSH username for 192.168.0.44 (not password): ');}finally{prompt.close();}}
 if(process.argv.length>4)throw Error('SSH_EXPORT_USAGE_INVALID');
 const identityFile=process.argv[3];
 const args=referenceSshArgs(user,identityFile);
 if(identityFile!==undefined){
  let keyStat;try{keyStat=await stat(resolve(identityFile));}catch{throw Error('SSH_PRIVATE_KEY_FILE_UNAVAILABLE');}
  if(!keyStat.isFile())throw Error('SSH_PRIVATE_KEY_FILE_UNAVAILABLE');
 }
 const php=await readFile(resolve(project,'scripts/export-mou-reference.php'),'utf8');
 const ssh=process.platform==='win32'?resolve(process.env.SystemRoot||'C:\\Windows','System32/OpenSSH/ssh.exe'):'ssh';
 const result=spawnSync(ssh,args,{input:php,encoding:'utf8',maxBuffer:2*1024*1024,timeout:60000,windowsHide:true});
 if(result.status!==0){
  const error=String(result.stderr||'');
  if(/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(error))throw Error('SSH_HOST_KEY_REQUIRES_OWNER_CHECK');
  if(/Permission denied|publickey/i.test(error))throw Error('SSH_ACCOUNT_OR_KEY_NOT_READY');
  if(/timed out|No route|refused/i.test(error))throw Error('SSH_NETWORK_UNAVAILABLE');
  throw Error('REFERENCE_EXPORT_FAILED');
 }
 let data;try{data=JSON.parse(result.stdout);}catch{throw Error('REFERENCE_EXPORT_INVALID_JSON');}
 const plan=referenceImportPlan(data);
 const folder=resolve(project,'.migration');await mkdir(folder,{recursive:true});
 const filename='mou-reference-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
 const output=resolve(folder,filename),body=JSON.stringify(data,null,2)+'\n';
 await writeFile(output,body,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({file:output,sha256:createHash('sha256').update(body).digest('hex'),...plan.summary},null,2));
 console.log('Reference export only. No Sheets writes, production changes, assessment records or credentials exported.');
}
main().catch(error=>{const allowed=['SSH_USERNAME_REQUIRED','SSH_PRIVATE_KEY_PATH_REQUIRED','SSH_PRIVATE_KEY_FILE_UNAVAILABLE','SSH_EXPORT_USAGE_INVALID','SSH_HOST_KEY_REQUIRES_OWNER_CHECK','SSH_ACCOUNT_OR_KEY_NOT_READY','SSH_NETWORK_UNAVAILABLE','REFERENCE_EXPORT_FAILED','REFERENCE_EXPORT_INVALID_JSON'];console.error(allowed.includes(error.message)?error.message:'REFERENCE_EXPORT_VALIDATION_OR_STORAGE_FAILED');process.exitCode=1;});
