// Normal Windows terminal only. Uses existing SSH keys; no key reads, writes, imports or ACL changes.
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {stat} from 'node:fs/promises';
import {referenceSshArgs} from './reference-ssh-options.js';
import {summarizeSshProbe} from './reference-ssh-diagnostics.js';

async function main() {
 if(process.argv.length!==4)throw Error('SSH_CHECK_USAGE: provide username and private-key file path');
 const user=process.argv[2],key=process.argv[3];
 const args=referenceSshArgs(user,key);
 let metadata;try{metadata=await stat(resolve(key));}catch{throw Error('SSH_PRIVATE_KEY_FILE_UNAVAILABLE');}
 if(!metadata.isFile())throw Error('SSH_PRIVATE_KEY_FILE_UNAVAILABLE');
 const ssh=process.platform==='win32'?resolve(process.env.SystemRoot||'C:\\Windows','System32/OpenSSH/ssh.exe'):'ssh';
 const options=args.slice(0,-2),target=args.at(-2);
 // Inspect resolved configuration without displaying it. Do not silently connect to another host.
 const config=spawnSync(ssh,['-G',...options,target],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024,windowsHide:true});
 if(config.status!==0)throw Error('SSH_CONFIGURATION_CHECK_FAILED');
 const setting=name=>String(config.stdout||'').split(/\r?\n/).find(line=>line.startsWith(name+' '))?.slice(name.length+1).trim();
 if(setting('hostname')!=='192.168.0.44'||setting('user')!==user)throw Error('SSH_RESOLVED_TARGET_MISMATCH');
 const port=setting('port');
 if(!/^\d{1,5}$/.test(port||''))throw Error('SSH_CONFIGURATION_CHECK_FAILED');
 // Fixed read-only marker command. BatchMode cannot prompt for a password or key passphrase.
 const result=spawnSync(ssh,['-vv',...options,'-o','PreferredAuthentications=publickey',target,"printf 'PORTAL_SSH_CHECK_OK\\n'"],{encoding:'utf8',timeout:20000,maxBuffer:1024*1024,windowsHide:true});
 const report=summarizeSshProbe(result);
 console.log(JSON.stringify({host:'192.168.0.44',user,port:Number(port),keyFileExists:true,...report},null,2));
 console.log('Safe summary only. No raw logs, key contents, database reads or Sheets writes.');
 if(report.code!=='SSH_READY')process.exitCode=1;
}
main().catch(error=>{
 const allowed=['SSH_CHECK_USAGE: provide username and private-key file path','SSH_USERNAME_REQUIRED','SSH_PRIVATE_KEY_PATH_REQUIRED','SSH_PRIVATE_KEY_FILE_UNAVAILABLE','SSH_CONFIGURATION_CHECK_FAILED','SSH_RESOLVED_TARGET_MISMATCH'];
 console.error(allowed.includes(error.message)?error.message:'SSH_CHECK_FAILED');process.exitCode=1;
});
