import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import schema from '../src/schema.json' with {type:'json'};
import {readConfig,loadLocalEnvironment} from '../src/config.js';
import {googleStore,parseTable} from '../src/google-store.js';
import {MOU_HOSPITAL_IDS} from '../src/mou-reference.js';
import {evidenceDrive} from '../src/evidence-drive.js';
import {sealBackup,openBackup} from '../src/backup.js';
import {privateDirectory,saveNewPrivateJson} from './private-files.js';
function column(n){let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
export async function captureBackup(config){
 const client=new OAuth2Client(config.storage.clientId,config.storage.clientSecret);client.setCredentials({refresh_token:config.storage.refreshToken});
 const request=async options=>(await client.request({method:'GET',timeout:30000,retry:false,...options})).data;
 const names=Object.keys(schema),base='https://sheets.googleapis.com/v4/spreadsheets/'+config.applicationSheetId;
 const meta=await request({url:base,params:{fields:'sheets(properties(title,gridProperties))'}});
 const ranges=names.map(n=>{const p=meta.sheets.find(s=>s.properties.title===n)?.properties;if(!p||p.gridProperties.rowCount>schema[n].maxRows+1)throw Error('BACKUP_SCHEMA_MISMATCH');return "'"+n+"'!A1:"+column(schema[n].headers.length)+p.gridProperties.rowCount;});
 async function capture(){const url=new URL(base+'/values:batchGet');url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');for(const range of ranges)url.searchParams.append('ranges',range);const data=await request({url:url.href});if(data.valueRanges?.length!==names.length)throw Error('BACKUP_SCHEMA_MISMATCH');return Object.fromEntries(names.map((n,i)=>{const v=data.valueRanges[i].values||[];parseTable(n,v);return [n,{headers:v[0],rows:v.slice(1).filter(r=>r.some(v=>v!==''&&v!=null)).map(r=>schema[n].headers.map((_,j)=>r[j]??''))}];}));}
 let tables;for(let attempt=0;attempt<3;attempt++){const a=await capture(),b=await capture();if(JSON.stringify(a)===JSON.stringify(b)){tables=b;break;}}if(!tables)throw Error('BACKUP_BUSY');
 const directory=await googleStore(config).forRequest().directory([...MOU_HOSPITAL_IDS]),files=parseTable('files',[tables.files.headers,...tables.files.rows]),fileContents=[],drive=evidenceDrive(config);let total=0;
 for(const f of files.filter(f=>f.upload_state==='complete')){total+=f.size_bytes;if(total>100*1024*1024)throw Error('BACKUP_FILE_LIMIT');fileContents.push({id:f.id,base64:(await drive.download(f)).toString('base64')});}
 return {format:'standard-portal-backup-v1',capturedAt:new Date().toISOString(),applicationSheetId:config.applicationSheetId,referenceSheetId:config.referenceSheetId,evidenceFolderId:config.evidenceFolderId,tables,directory,fileContents};
}
export async function backupKey(){await privateDirectory();let saved;try{saved=JSON.parse(await readFile('.secrets/backup-key.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;await saveNewPrivateJson('backup-key.json',{key:randomBytes(32).toString('hex'),createdAt:new Date().toISOString()});saved=JSON.parse(await readFile('.secrets/backup-key.json','utf8'));}if(!/^[a-f0-9]{64}$/.test(saved.key))throw Error('INVALID_BACKUP_KEY');return Buffer.from(saved.key,'hex');}
async function main(){
 const key=await backupKey();let snapshot,path;
 if(process.argv[2]==='--verify'){path=process.argv[3];snapshot=openBackup(JSON.parse(await readFile(path,'utf8')),key);}
 else {const config=readConfig(await loadLocalEnvironment());snapshot=await captureBackup(config);const sealed=sealBackup(snapshot,key);await mkdir('.backups',{recursive:true});path='.backups/portal-'+snapshot.capturedAt.replace(/[:.]/g,'-')+'.encrypted.json';await writeFile(path,JSON.stringify(sealed)+'\n',{flag:'wx',mode:0o600});snapshot=openBackup(JSON.parse(await readFile(path,'utf8')),key);}
 const result={ok:true,path,tables:Object.fromEntries(Object.entries(snapshot.tables).map(([n,t])=>[n,t.rows.length])),filesVerified:snapshot.fileContents.length,encrypted:true,decryptionVerified:true,sha256:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')};console.log(JSON.stringify(result));
}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/backup-portal.js'))main().catch(e=>{console.error('BACKUP_FAILED: '+(['BACKUP_BUSY','BACKUP_SCHEMA_MISMATCH','BACKUP_FILE_LIMIT','BACKUP_AUTHENTICATION_FAILED'].includes(e.code||e.message)?e.code||e.message:'PRIVATE_DETAILS_HIDDEN'));process.exitCode=1;});
