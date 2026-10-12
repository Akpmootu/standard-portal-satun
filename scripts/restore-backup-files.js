import {readFile,writeFile} from 'node:fs/promises';
import {OAuth2Client} from 'google-auth-library';
import {openBackup} from '../src/backup.js';
import {readConfig,loadLocalEnvironment} from '../src/config.js';
import {evidenceDrive,privateFile} from '../src/evidence-drive.js';
import {parseTable} from '../src/google-store.js';
// Restore evidence into a NEW private test folder. Never mutate production files.
try {
 const config=readConfig(await loadLocalEnvironment()),key=JSON.parse(await readFile('.secrets/backup-key.json','utf8'));
 const snapshot=openBackup(JSON.parse(await readFile(process.argv[2],'utf8')),Buffer.from(key.key,'hex'));
 const client=new OAuth2Client(config.storage.clientId,config.storage.clientSecret);client.setCredentials({refresh_token:config.evidence.refreshToken});
 const created=(await client.request({url:'https://www.googleapis.com/drive/v3/files',method:'POST',params:{fields:'id'},data:{name:'Standard Portal — Isolated Evidence Restore — '+snapshot.capturedAt,mimeType:'application/vnd.google-apps.folder'},timeout:30000,retry:false})).data;
 const isolated={...config,evidenceFolderId:created.id},drive=evidenceDrive(isolated,client);
 privateFile(await drive.metadata(created.id),isolated,'application/vnd.google-apps.folder');
 const files=parseTable('files',[snapshot.tables.files.headers,...snapshot.tables.files.rows]),restored=[];
 for(const file of files.filter(f=>f.upload_state==='complete')){
  const bytes=Buffer.from(snapshot.fileContents.find(f=>f.id===file.id).base64,'base64'),copy={...file,drive_file_id:await drive.generateId()};
  const location=await drive.begin(copy);let offset=0;
  while(offset<bytes.length){const r=await drive.chunk(location,bytes.subarray(offset,Math.min(offset+1024*1024,bytes.length)),offset,bytes.length,copy.mime_type);if(r.nextOffset<=offset)throw Error('RESTORE_STALLED');offset=r.nextOffset;}
  await drive.verify(copy);restored.push({fileId:file.id,oldDriveId:file.drive_file_id,newDriveId:copy.drive_file_id,size:file.size_bytes,sha256:file.sha256});
 }
 const receipt={ok:true,isolated:true,private:true,folderId:created.id,restoredAt:new Date().toISOString(),files:restored};
 await writeFile('.migration/restore-files-verification-2026-10-09.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(receipt));
}catch{console.error('ISOLATED_FILE_RESTORE_FAILED: PRIVATE_DETAILS_HIDDEN');process.exitCode=1;}
