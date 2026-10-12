import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {referenceSshArgs} from './reference-ssh-options.js';
try{
 const php=await readFile(new URL('./export-complete-archive.php',import.meta.url),'utf8');
 const r=spawnSync('C:/Windows/System32/OpenSSH/ssh.exe',referenceSshArgs(...process.argv.slice(2)),{input:php,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:96*1024*1024});
 if(r.status!==0)throw Error('EXPORT_FAILED');const data=JSON.parse(r.stdout);
 if(data.format!=='standard-portal-source-archive-v1'||data.readOnly!==true||Object.keys(data.tables).length!==20)throw Error('INVALID_EXPORT');
 const folder='.migration/complete-archive';await mkdir(folder,{recursive:true});const body=JSON.stringify(data)+'\n';
 await writeFile(folder+'/source.json',body,{flag:'wx',mode:0o600});
 const manifest={capturedAt:data.capturedAt,sha256:createHash('sha256').update(body).digest('hex'),bytes:Buffer.byteLength(body),tables:Object.fromEntries(Object.entries(data.tables).map(([n,t])=>[n,{rows:t.rows.length,columns:t.headers.length}])),omittedCredentialColumns:data.omittedCredentialColumns};
 await writeFile(folder+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest));
}catch{console.error('COMPLETE_ARCHIVE_EXPORT_FAILED: PRIVATE_DETAILS_HIDDEN');process.exitCode=1;}
