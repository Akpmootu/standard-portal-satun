// Raw OpenSSH logs are untrusted and may contain private paths. Never return or print them.
export function summarizeSshProbe(result) {
 const log=typeof result.stderr==='string'?result.stderr:'';
 const authenticated=/Authenticated to .+ using "publickey"|Authentication succeeded \(publickey\)/i.test(log);
 const commandCompleted=result.status===0&&String(result.stdout||'').trim()==='PORTAL_SSH_CHECK_OK';
 const facts={authenticated,keyOffered:/Offering public key:/i.test(log),keyAcceptedDuringAttempt:/Server accepts key:/i.test(log),remoteCommandCompleted:commandCompleted};
 let code='SSH_CHECK_INCONCLUSIVE';
 if(result.error?.code==='ENOENT')code='SSH_EXECUTABLE_NOT_FOUND';
 else if(result.error?.code==='ETIMEDOUT')code='SSH_CHECK_TIMEOUT';
 else if(/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(log))code='SSH_HOST_KEY_REQUIRES_OWNER_CHECK';
 else if(/UNPROTECTED PRIVATE KEY FILE|bad permissions|permissions .* too open/i.test(log))code='SSH_KEY_FILE_PERMISSIONS_REJECTED';
 else if(/Load key .*(?:invalid format|error in libcrypto)/i.test(log))code='SSH_KEY_FORMAT_UNSUPPORTED';
 else if(/Load key .*Permission denied|identity file .*not accessible|no such identity/i.test(log))code='SSH_KEY_FILE_UNREADABLE';
 else if(/no matching (?:host key type|key exchange method|cipher|signature)|no mutual signature algorithm/i.test(log))code='SSH_ALGORITHM_MISMATCH';
 else if(authenticated&&commandCompleted)code='SSH_READY';
 else if(authenticated)code='SSH_AUTHENTICATED_REMOTE_COMMAND_FAILED';
 else if(/incorrect passphrase|no passphrase given|sign_and_send_pubkey: signing failed|agent refused operation/i.test(log))code='SSH_KEY_UNLOCK_OR_SIGNING_FAILED';
 else if(facts.keyAcceptedDuringAttempt)code='SSH_KEY_ACCEPTED_AUTH_INCOMPLETE';
 else if(/Permission denied \(/i.test(log))code='SSH_PUBLIC_KEY_AUTH_FAILED';
 else if(/Connection timed out|No route to host|Connection refused|Could not resolve hostname/i.test(log))code='SSH_NETWORK_UNAVAILABLE';
 return {code,...facts};
}
