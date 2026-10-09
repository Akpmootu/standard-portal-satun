import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {referenceSshArgs} from './reference-ssh-options.js';
const [user,key]=process.argv.slice(2);
try{
 const args=referenceSshArgs(user,key),php=await readFile(new URL('./export-remaining.php',import.meta.url),'utf8');
 const r=spawnSync(resolve(process.env.SystemRoot,'System32/OpenSSH/ssh.exe'),args,{input:php,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:32*1024*1024});
 if(r.status!==0)throw Error('EXPORT_FAILED');
 const d=JSON.parse(r.stdout);if(d.format!=='standard-portal-remaining-v1'||d.source?.read_only!==true)throw Error('INVALID_EXPORT');
 const folder=resolve('.migration');await mkdir(folder,{recursive:true});
 const path=resolve(folder,'remaining-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
 const body=JSON.stringify(d,null,2)+'\n';await writeFile(path,body,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({path,sha256:createHash('sha256').update(body).digest('hex'),counts:Object.fromEntries(Object.entries(d.tables).map(([k,v])=>[k,v.length])),productionWrites:false,accountGrants:false}));
}catch{console.error('REMAINING_EXPORT_FAILED: no private records or credentials printed');process.exitCode=1;}
