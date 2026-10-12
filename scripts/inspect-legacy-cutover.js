import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {referenceSshArgs} from './reference-ssh-options.js';
try{
 const php=await readFile(new URL('./inspect-legacy-cutover.php',import.meta.url),'utf8');
 const result=spawnSync('C:/Windows/System32/OpenSSH/ssh.exe',referenceSshArgs(...process.argv.slice(2)),{input:php,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:2*1024*1024});
 if(result.status!==0)throw Error();const report=JSON.parse(result.stdout);
 if(report.readOnly!==true||report.sourceWrites!==false||report.databaseAccess!==false||!Array.isArray(report.phpFiles))throw Error();
 const file='.migration/legacy-cutover-inspection-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
 await mkdir('.migration',{recursive:true});await writeFile(file,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({file,...report}));
}catch{console.error('LEGACY_CUTOVER_INSPECTION_FAILED: PRIVATE_DETAILS_HIDDEN');process.exitCode=1;}
