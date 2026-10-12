import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
try{
 const root='.migration/complete-archive',source=await readFile(root+'/source.json'),assets=JSON.parse(await readFile(root+'/assets.json','utf8')),files=[],seen=new Set();
 for(const f of assets){if(seen.has(f.sha256))continue;seen.add(f.sha256);const bytes=await readFile(root+'/assets/'+f.localName);if(createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error();files.push({...f,base64:bytes.toString('base64')});}
 const catalog=JSON.parse(await readFile('src/migration-resources.json','utf8'));
 const snapshot={format:'standard-portal-source-archive-backup-v1',createdAt:new Date().toISOString(),sourceBase64:source.toString('base64'),sourceSha256:createHash('sha256').update(source).digest('hex'),catalog,sourcePaths:assets,files};
 const plain=Buffer.from(JSON.stringify(snapshot)),key=Buffer.from(JSON.parse(await readFile('.secrets/backup-key.json','utf8')).key,'hex');if(key.length!==32)throw Error();
 const iv=randomBytes(12),aad=Buffer.from(snapshot.format),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);
 const ciphertext=Buffer.concat([cipher.update(gzipSync(plain)),cipher.final()]),tag=cipher.getAuthTag(),hash=createHash('sha256').update(plain).digest('hex');
 const envelope={format:snapshot.format,iv:iv.toString('base64'),tag:tag.toString('base64'),sha256:hash,ciphertext:ciphertext.toString('base64')};
 await mkdir('.backups',{recursive:true});const path='.backups/source-archive-'+new Date().toISOString().replace(/[:.]/g,'-')+'.encrypted.json';await writeFile(path,JSON.stringify(envelope)+'\n',{flag:'wx',mode:0o600});
 const saved=JSON.parse(await readFile(path,'utf8')),decrypt=createDecipheriv('aes-256-gcm',key,Buffer.from(saved.iv,'base64'));decrypt.setAAD(aad);decrypt.setAuthTag(Buffer.from(saved.tag,'base64'));
 const restored=gunzipSync(Buffer.concat([decrypt.update(Buffer.from(saved.ciphertext,'base64')),decrypt.final()]));if(!restored.equals(plain)||createHash('sha256').update(restored).digest('hex')!==hash)throw Error();
 const receipt={path,encrypted:true,decryptionVerified:true,sourceTables:20,sourcePaths:assets.length,uniqueFiles:files.length,sha256:hash};await writeFile(root+'/backup-receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}catch{console.error('SOURCE_ARCHIVE_BACKUP_FAILED: PRIVATE_DETAILS_HIDDEN');process.exitCode=1;}
