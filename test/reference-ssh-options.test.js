import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {referenceSshArgs} from '../scripts/reference-ssh-options.js';

test('reference export accepts explicit project key path without weakening host verification',()=>{
 const key='folder with spaces/hait-rg12_ed25519';
 const args=referenceSshArgs('administrators',key);
 assert.equal(args[args.indexOf('-i')+1],resolve(key));
 for(const setting of ['BatchMode=yes','StrictHostKeyChecking=yes','IdentitiesOnly=yes'])assert.ok(args.includes(setting));
 assert.deepEqual(args.slice(-2),['administrators@192.168.0.44','php /dev/stdin']);
});
test('no-key mode preserves normal SSH identity selection; invalid usernames and public keys rejected',()=>{
 assert.ok(!referenceSshArgs('administrators').includes('-i'));
 for(const user of ['-bad','name@host','a b',''])assert.throws(()=>referenceSshArgs(user),/SSH_USERNAME_REQUIRED/);
 for(const key of ['','id_rsa.pub','id_rsa.ppk','bad\npath'])assert.throws(()=>referenceSshArgs('administrators',key),/SSH_PRIVATE_KEY_PATH_REQUIRED/);
});
