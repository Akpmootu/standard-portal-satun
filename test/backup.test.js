import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import schema from '../src/schema.json' with {type:'json'};
import {sealBackup,openBackup,validateBackup} from '../src/backup.js';
function fixture(){return {format:'standard-portal-backup-v1',capturedAt:'2026-10-09T00:00:00Z',applicationSheetId:'1dWXmgRRg1yP39OSxl2PmFarlH1xAi1gaKy-rJc4Ve7k',referenceSheetId:'10UtjMGPnBKeMasgtrwYs3SPbqSu-f_RIhPU2tHYAaJw',tables:Object.fromEntries(Object.entries(schema).map(([n,t])=>[n,{headers:t.headers,rows:[]}])),directory:[],fileContents:[]};}
test('encrypted backup round trips and uses a fresh nonce',()=>{const s=fixture(),k=randomBytes(32),a=sealBackup(s,k),b=sealBackup(s,k);assert.deepEqual(openBackup(a,k),s);assert.notEqual(a.ciphertext,b.ciphertext);assert.ok(!a.ciphertext.includes(s.applicationSheetId));});
test('tampering and the wrong key cannot restore data',()=>{const k=randomBytes(32),a=sealBackup(fixture(),k);assert.throws(()=>openBackup(a,randomBytes(32)));for(const field of ['iv','tag','ciphertext']){const b=structuredClone(a),v=Buffer.from(b[field],'base64');v[0]^=1;b[field]=v.toString('base64');assert.throws(()=>openBackup(b,k));}assert.throws(()=>openBackup({...a,sha256:'0'.repeat(64)},k));});
test('missing tables and mismatched schema fail closed',()=>{const s=fixture();delete s.tables.users;assert.throws(()=>validateBackup(s));const t=fixture();t.tables.users.headers=['id'];assert.throws(()=>validateBackup(t));});
test('unmatched embedded files cannot pass completeness validation',()=>{const s=fixture();s.fileContents=[{id:'orphan',base64:'YQ=='}];assert.throws(()=>validateBackup(s));});
