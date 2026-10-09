import {resolve} from 'node:path';

export function referenceSshArgs(user, identityFile) {
 if(!/^[a-zA-Z_][a-zA-Z0-9_.-]{0,63}$/.test(user||''))throw Error('SSH_USERNAME_REQUIRED');
 const args=['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10'];
 if(identityFile!==undefined){
  if(typeof identityFile!=='string'||!identityFile.trim()||/[\r\n\0]/.test(identityFile)||/\.(pub|ppk)$/i.test(identityFile))throw Error('SSH_PRIVATE_KEY_PATH_REQUIRED');
  // Pass only the path to OpenSSH; this helper never opens or prints key contents.
  args.push('-o','IdentitiesOnly=yes','-i',resolve(identityFile));
 }
 args.push(`${user}@192.168.0.44`,'php /dev/stdin');
 return args;
}
