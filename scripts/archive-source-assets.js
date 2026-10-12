import {OAuth2Client} from 'google-auth-library';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readConfig,loadLocalEnvironment} from '../src/config.js';
import {privateFile} from '../src/evidence-drive.js';
try{
 const config=readConfig(await loadLocalEnvironment()),client=new OAuth2Client(config.storage.clientId,config.storage.clientSecret);
 client.setCredentials({refresh_token:config.evidence.refreshToken});
 const request=async o=>(await client.request({timeout:45000,retry:false,...o})).data;
 const folder=await request({url:'https://www.googleapis.com/drive/v3/files',method:'POST',params:{fields:'id'},data:{name:'Standard Portal — คู่มือและทรัพยากรต้นฉบับ — 2026-10-12',mimeType:'application/vnd.google-apps.folder'}});
 const fields='id,size,sha256Checksum,mimeType,trashed,shared,owners(emailAddress),permissions(role,emailAddress),appProperties,parents';
 privateFile(await request({url:'https://www.googleapis.com/drive/v3/files/'+folder.id,method:'GET',params:{fields}}),config,'application/vnd.google-apps.folder');
 const source=JSON.parse(await readFile('.migration/complete-archive/assets.json','utf8')),files=[],byHash=new Map();
 for(const f of source){
  if(byHash.has(f.sha256)){byHash.get(f.sha256).sourcePaths.push(f.sourcePath);continue;}
  const bytes=await readFile('.migration/complete-archive/assets/'+f.localName),mime=f.localName.endsWith('.pdf')?'application/pdf':'image/png',id='resource-'+f.localName.replace(/\.[^.]+$/,'');
  if(createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error('SOURCE_HASH_CHANGED');
  const metadata={name:f.localName,mimeType:mime,parents:[folder.id],appProperties:{portalFileId:id}},boundary='portal_archive_'+Date.now();
  const body=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=utf-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n'),bytes,Buffer.from('\r\n--'+boundary+'--\r\n')]);
  const uploaded=await request({url:'https://www.googleapis.com/upload/drive/v3/files',method:'POST',params:{uploadType:'multipart',fields:'id'},headers:{'Content-Type':'multipart/related; boundary='+boundary},data:body});
  const m=await request({url:'https://www.googleapis.com/drive/v3/files/'+uploaded.id,method:'GET',params:{fields}});privateFile(m,config,mime);
  const received=Buffer.from(await request({url:'https://www.googleapis.com/drive/v3/files/'+uploaded.id,method:'GET',params:{alt:'media'},responseType:'arraybuffer'}));
  if(received.length!==bytes.length||createHash('sha256').update(received).digest('hex')!==f.sha256||m.parents?.[0]!==folder.id)throw Error('ARCHIVE_READBACK_FAILED');
  const record={id,slug:f.localName.replace(/\.[^.]+$/,''),drive_file_id:uploaded.id,original_filename:f.localName,mime_type:mime,size_bytes:f.bytes,sha256:f.sha256,sourcePaths:[f.sourcePath]};files.push(record);byHash.set(f.sha256,record);
 }
 const result={assetFolderId:folder.id,files,verified:true,private:true};await writeFile('.migration/complete-archive/drive-assets.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({private:true,sourcePaths:source.length,uniqueFiles:files.length,allHashesMatch:true}));
}catch{console.error('ARCHIVE_ASSET_FAILED: PRIVATE_DETAILS_HIDDEN');process.exitCode=1;}
