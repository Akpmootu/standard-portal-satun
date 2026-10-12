import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createDecipheriv,createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import catalog from '../src/migration-resources.json' with {type:'json'};
import {privateDirectory} from './private-files.js';

const sha=b=>createHash('sha256').update(b).digest('hex');
const format='standard-portal-source-archive-backup-v1';
function requireValue(ok){if(!ok)throw Error('SOURCE_BACKUP_INVALID');}

// No Google calls or production writes. The caller obtains a private cloud copy first.
export function decodeSourceBackup(envelope,key,expected=catalog){
 requireValue(envelope.format===format&&Buffer.isBuffer(key)&&key.length===32);
 const iv=Buffer.from(envelope.iv,'base64'),tag=Buffer.from(envelope.tag,'base64');
 requireValue(iv.length===12&&tag.length===16);
 const decipher=createDecipheriv('aes-256-gcm',key,iv);
 decipher.setAAD(Buffer.from(format));decipher.setAuthTag(tag);
 const plain=gunzipSync(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]),{maxOutputLength:96*1024*1024});
 requireValue(sha(plain)===envelope.sha256);
 const restored=JSON.parse(plain),source=Buffer.from(restored.sourceBase64,'base64');
 requireValue(restored.format===format&&sha(source)===restored.sourceSha256&&sha(source)===expected.originalSnapshot.sha256);
 const data=JSON.parse(source);
 requireValue(data.format==='standard-portal-source-archive-v1'&&data.readOnly===true);
 requireValue(JSON.stringify(Object.keys(data.tables).sort())===JSON.stringify(Object.keys(expected.archive.tables).sort()));
 for(const [name,table] of Object.entries(data.tables)){
  const target=expected.archive.tables[name];
  requireValue(table.rows.length===target.rows&&JSON.stringify(table.headers)===JSON.stringify(target.headers));
 }
 requireValue(restored.files.length===expected.files.length);
 const files=new Map();
 for(const file of restored.files){
  const bytes=Buffer.from(file.base64,'base64'),wanted=expected.files.find(f=>f.sha256===file.sha256);
  requireValue(wanted&&sha(bytes)===file.sha256&&bytes.length===wanted.size_bytes&&!files.has(file.sha256));
  files.set(file.sha256,bytes);
 }
 const paths=restored.sourcePaths;
 const wantedPaths=expected.files.flatMap(f=>f.sourcePaths.map(path=>({path,sha256:f.sha256})));
 requireValue(Array.isArray(paths)&&paths.length===wantedPaths.length&&new Set(paths.map(p=>p.sourcePath)).size===paths.length);
 for(const p of paths)requireValue(wantedPaths.some(w=>w.path===p.sourcePath&&w.sha256===p.sha256)&&files.get(p.sha256)?.length===p.bytes);
 return {source,files,paths,rows:Object.values(data.tables).reduce((n,t)=>n+t.rows.length,0),tables:Object.keys(data.tables).length,plaintextSha256:sha(plain)};
}

async function main(){
 const input=process.argv[2];if(!input)throw Error('SOURCE_BACKUP_REQUIRED');
 const envelope=JSON.parse(await readFile(input,'utf8'));
 const key=Buffer.from(JSON.parse(await readFile('.secrets/backup-key.json','utf8')).key,'hex');
 const restored=decodeSourceBackup(envelope,key);
 // Inherit the protected secrets directory ACL. Names derive only from hashes;
 // stored source paths are metadata and never become filesystem destinations.
 const privateRoot=await privateDirectory();
 const folder=resolve(privateRoot,'archive-restore-'+new Date().toISOString().replace(/[:.]/g,'-'));
 await mkdir(folder,{mode:0o700});
 await writeFile(resolve(folder,'source.json'),restored.source,{flag:'wx',mode:0o600});
 requireValue(sha(await readFile(resolve(folder,'source.json')))===catalog.originalSnapshot.sha256);
 for(const [hash,bytes] of restored.files){
  const file=resolve(folder,hash+'.bin');await writeFile(file,bytes,{flag:'wx',mode:0o600});
  requireValue(sha(await readFile(file))===hash);
 }
 await writeFile(resolve(folder,'source-paths.json'),JSON.stringify(restored.paths)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({ok:true,cloudCopySuppliedByOperator:true,restoredTo:folder,tables:restored.tables,rows:restored.rows,uniqueFiles:restored.files.size,sourcePaths:restored.paths.length,allBytesReadBack:true,plaintextSha256:restored.plaintextSha256,productionWrites:false,cloudRestore:false}));
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/verify-source-backup.js'))main().catch(()=>{console.error('SOURCE_BACKUP_VERIFY_FAILED: PRIVATE_DETAILS_HIDDEN');process.exitCode=1;});
