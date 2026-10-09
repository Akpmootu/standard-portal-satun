import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeSshProbe} from '../scripts/reference-ssh-diagnostics.js';
test('SSH probe separates rejected keys, incomplete signing, and successful authentication',()=>{
 const rejected=summarizeSshProbe({status:255,stderr:'debug1: Offering public key: PRIVATE-PATH\nPermission denied (publickey,password).'});
 assert.equal(rejected.code,'SSH_PUBLIC_KEY_AUTH_FAILED');assert.equal(rejected.keyOffered,true);assert.equal(rejected.authenticated,false);
 const incomplete=summarizeSshProbe({status:255,stderr:'debug1: Server accepts key: PRIVATE-PATH\nPermission denied (publickey).'});
 assert.equal(incomplete.code,'SSH_KEY_ACCEPTED_AUTH_INCOMPLETE');
 assert.equal(summarizeSshProbe({stderr:'sign_and_send_pubkey: signing failed: agent refused operation'}).code,'SSH_KEY_UNLOCK_OR_SIGNING_FAILED');
 assert.equal(summarizeSshProbe({status:0,stdout:'PORTAL_SSH_CHECK_OK\n',stderr:'Authenticated to 192.168.0.44 using "publickey".'}).code,'SSH_READY');
 assert.equal(summarizeSshProbe({status:1,stderr:'Authenticated to 192.168.0.44 using "publickey".\nPermission denied'}).code,'SSH_AUTHENTICATED_REMOTE_COMMAND_FAILED');
});
test('SSH probe never exposes raw errors, paths, fingerprints or arbitrary fields',()=>{
 for(const [log,code] of [['UNPROTECTED PRIVATE KEY FILE! SECRET-CANARY','SSH_KEY_FILE_PERMISSIONS_REJECTED'],['Load key "SECRET-CANARY": Permission denied','SSH_KEY_FILE_UNREADABLE'],['Load key "SECRET-CANARY": invalid format','SSH_KEY_FORMAT_UNSUPPORTED'],['Host key verification failed. SECRET-CANARY','SSH_HOST_KEY_REQUIRES_OWNER_CHECK'],['no mutual signature algorithm SECRET-CANARY','SSH_ALGORITHM_MISMATCH'],['Connection refused SECRET-CANARY','SSH_NETWORK_UNAVAILABLE']]){
  const report=summarizeSshProbe({stderr:log,arbitrary:'SECRET-CANARY'});assert.equal(report.code,code);assert.ok(!JSON.stringify(report).includes('SECRET-CANARY'));
 }
 assert.equal(summarizeSshProbe({error:{code:'ETIMEDOUT',message:'SECRET-CANARY'}}).code,'SSH_CHECK_TIMEOUT');
});
