import {readFile} from 'node:fs/promises';
import {OAuth2Client} from 'google-auth-library';
import {readConfig,loadLocalEnvironment} from '../src/config.js';
import {privateFile} from '../src/evidence-drive.js';
import {saveNewPrivateJson,privateDirectory} from './private-files.js';
async function main(){
 await privateDirectory();const config=readConfig(await loadLocalEnvironment());if(!config.evidence.refreshToken)throw new Error('EVIDENCE_AUTH_REQUIRED');
 const client=new OAuth2Client(config.storage.clientId,config.storage.clientSecret);client.setCredentials({refresh_token:config.evidence.refreshToken});
 let existing;try{existing=JSON.parse(await readFile('.secrets/evidence-folder.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const fields='id,mimeType,trashed,shared,owners(emailAddress),permissions(role,emailAddress)';
 const response=existing?await client.request({url:'https://www.googleapis.com/drive/v3/files/'+existing.id,params:{fields},timeout:30000,retry:false}):await client.request({url:'https://www.googleapis.com/drive/v3/files',method:'POST',params:{fields},data:{name:'Standard Portal Satun — Private Evidence',mimeType:'application/vnd.google-apps.folder',appProperties:{portalPurpose:'evidence-v1'}},timeout:30000,retry:false});
 privateFile(response.data,config,'application/vnd.google-apps.folder');if(!existing)await saveNewPrivateJson('evidence-folder.json',{id:response.data.id,ownerEmail:config.ownerEmail,createdAt:new Date().toISOString()});
 console.log('PASS: app-created evidence folder is private; no sharing permissions added.');
}
main().catch(e=>{console.error(['EVIDENCE_AUTH_REQUIRED','EVIDENCE_NOT_PRIVATE'].includes(e.code||e.message)?e.code||e.message:'EVIDENCE_FOLDER_SETUP_FAILED');process.exitCode=1;});
