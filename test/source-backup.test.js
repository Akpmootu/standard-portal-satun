import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createHash,randomBytes} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {decodeSourceBackup} from '../scripts/verify-source-backup.js';

const sha=b=>createHash('sha256').update(b).digest('hex');
const key=randomBytes(32),format='standard-portal-source-archive-backup-v1';
const bytes=Buffer.from('isolated-file'),hash=sha(bytes);
const source=Buffer.from(JSON.stringify({format:'standard-portal-source-archive-v1',readOnly:true,tables:{sample:{headers:['id','value'],rows:[[1,null],[2,'\r\n']]}}}));
const expected={originalSnapshot:{sha256:sha(source)},archive:{tables:{sample:{headers:['id','value'],rows:2}}},files:[{sha256:hash,size_bytes:bytes.length,sourcePaths:['a.pdf','duplicate.pdf']}]};
function snapshot(){return {format,sourceBase64:source.toString('base64'),sourceSha256:sha(source),files:[{sha256:hash,base64:bytes.toString('base64')}],sourcePaths:[{sourcePath:'a.pdf',sha256:hash,bytes:bytes.length},{sourcePath:'duplicate.pdf',sha256:hash,bytes:bytes.length}]};}
function seal(value){const plain=Buffer.from(JSON.stringify(value)),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(format));const ciphertext=Buffer.concat([cipher.update(gzipSync(plain)),cipher.final()]);return {format,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),sha256:sha(plain),ciphertext:ciphertext.toString('base64')};}

test('source restore preserves exact bytes, NULL, CRLF and duplicate source-path mappings',()=>{
 const result=decodeSourceBackup(seal(snapshot()),key,expected);
 assert.deepEqual(result.source,source);assert.deepEqual(result.files.get(hash),bytes);
 assert.equal(result.paths.length,2);assert.equal(result.files.size,1);assert.equal(result.rows,2);
});
test('source restore rejects wrong key and altered authenticated ciphertext',()=>{
 const envelope=seal(snapshot());assert.throws(()=>decodeSourceBackup(envelope,randomBytes(32),expected));
 const changed=Buffer.from(envelope.ciphertext,'base64');changed[0]^=1;
 assert.throws(()=>decodeSourceBackup({...envelope,ciphertext:changed.toString('base64')},key,expected));
});
test('source restore rejects validly encrypted wrong source, damaged assets and missing mappings',()=>{
 let value=snapshot();value.sourceBase64=Buffer.from('{}').toString('base64');assert.throws(()=>decodeSourceBackup(seal(value),key,expected));
 value=snapshot();value.files[0].base64=Buffer.from('changed').toString('base64');assert.throws(()=>decodeSourceBackup(seal(value),key,expected));
 value=snapshot();value.sourcePaths.pop();assert.throws(()=>decodeSourceBackup(seal(value),key,expected));
});
