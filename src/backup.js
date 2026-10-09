import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {fail} from './errors.js';
import schema from './schema.json' with {type:'json'};
import {parseTable} from './google-store.js';
export function validateBackup(snapshot){
 fail(snapshot?.format==='standard-portal-backup-v1'&&typeof snapshot.capturedAt==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(snapshot.capturedAt),'INVALID_BACKUP');
 fail(snapshot.applicationSheetId==='1dWXmgRRg1yP39OSxl2PmFarlH1xAi1gaKy-rJc4Ve7k'&&snapshot.referenceSheetId==='10UtjMGPnBKeMasgtrwYs3SPbqSu-f_RIhPU2tHYAaJw','WRONG_BACKUP_SOURCE');
 fail(snapshot.tables&&Object.keys(snapshot.tables).length===Object.keys(schema).length&&Object.keys(snapshot.tables).every(n=>Object.hasOwn(schema,n)),'INVALID_BACKUP_TABLES');
 for(const [name,t] of Object.entries(snapshot.tables)){fail(Array.isArray(t.rows)&&JSON.stringify(t.headers)===JSON.stringify(schema[name].headers),'INVALID_BACKUP_SCHEMA');parseTable(name,[t.headers,...t.rows]);}
 fail(Array.isArray(snapshot.directory)&&snapshot.directory.length<=100&&snapshot.directory.every(r=>/^\d{5}$/.test(r.id)&&typeof r.name==='string'),'INVALID_BACKUP_DIRECTORY');
 const files=snapshot.tables.files.rows.map(row=>Object.fromEntries(snapshot.tables.files.headers.map((h,i)=>[h,row[i]??'']))),complete=files.filter(f=>f.upload_state==='complete');
 fail(Array.isArray(snapshot.fileContents)&&snapshot.fileContents.length===complete.length,'INCOMPLETE_FILE_BACKUP');
 let total=0;for(const file of complete){const matches=snapshot.fileContents.filter(f=>f.id===file.id);fail(matches.length===1&&typeof matches[0].base64==='string','INCOMPLETE_FILE_BACKUP');const bytes=Buffer.from(matches[0].base64,'base64');total+=bytes.length;fail(total<=100*1024*1024&&bytes.length===file.size_bytes&&createHash('sha256').update(bytes).digest('hex')===file.sha256,'INVALID_BACKUP_FILE');}
 return snapshot;
}
export function sealBackup(snapshot,key){
 validateBackup(snapshot);fail(Buffer.isBuffer(key)&&key.length===32,'INVALID_BACKUP_KEY');
 const plain=Buffer.from(JSON.stringify(snapshot)),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),aad=Buffer.from('standard-portal-backup-aes256gcm-v1');cipher.setAAD(aad);
 const ciphertext=Buffer.concat([cipher.update(gzipSync(plain)),cipher.final()]);
 return {format:aad.toString(),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),sha256:createHash('sha256').update(plain).digest('hex'),ciphertext:ciphertext.toString('base64')};
}
export function openBackup(envelope,key){
 fail(envelope?.format==='standard-portal-backup-aes256gcm-v1'&&Buffer.isBuffer(key)&&key.length===32,'INVALID_BACKUP');
 try{const iv=Buffer.from(envelope.iv,'base64'),tag=Buffer.from(envelope.tag,'base64');fail(iv.length===12&&tag.length===16&&envelope.ciphertext.length<=150*1024*1024,'INVALID_BACKUP');const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(Buffer.from(envelope.format));decipher.setAuthTag(tag);const plain=gunzipSync(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]),{maxOutputLength:150*1024*1024});fail(createHash('sha256').update(plain).digest('hex')===envelope.sha256,'BACKUP_CHECKSUM_MISMATCH');return validateBackup(JSON.parse(plain));}catch{fail(false,'BACKUP_AUTHENTICATION_FAILED');}
}
