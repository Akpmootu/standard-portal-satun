import {OAuth2Client} from 'google-auth-library';
import {createHash} from 'node:crypto';
import {fail,PortalError} from './errors.js';
import {evidenceLimit,evidenceSignature} from './evidence-types.js';
export const EVIDENCE_SCOPES=['openid','email','https://www.googleapis.com/auth/drive.file'];
export function validUploadLocation(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='www.googleapis.com'&&!u.username&&!u.password&&u.pathname==='/upload/drive/v3/files'&&u.searchParams.get('uploadType')==='resumable'&&Boolean(u.searchParams.get('upload_id'));}catch{return false;}}
export function privateFile(file,config,mime){
 fail(file?.mimeType===mime&&!file.trashed&&file.shared===false&&file.owners?.length===1&&file.owners[0].emailAddress===config.ownerEmail&&file.permissions?.length===1&&file.permissions[0].role==='owner'&&file.permissions[0].emailAddress===config.ownerEmail,'EVIDENCE_NOT_PRIVATE',403);
}
export function evidenceDrive(config,injectedClient){
 const client=injectedClient||new OAuth2Client(config.storage.clientId,config.storage.clientSecret);if(!injectedClient)client.setCredentials({refresh_token:config.evidence.refreshToken});
 async function request(options){try{return await client.request({timeout:30000,retry:false,maxRedirects:0,...options});}catch{throw new PortalError('EVIDENCE_DRIVE_UNAVAILABLE',503);}}
 const fileFields='id,mimeType,size,sha256Checksum,trashed,shared,parents,owners(emailAddress),permissions(role,emailAddress),appProperties';
 async function metadata(id){fail(/^[A-Za-z0-9_-]{10,200}$/.test(id),'INVALID_FILE_ID',400);return (await request({url:'https://www.googleapis.com/drive/v3/files/'+id,method:'GET',params:{fields:fileFields}})).data;}
 async function begin(file){
  privateFile(await metadata(config.evidenceFolderId),config,'application/vnd.google-apps.folder');
  const result=await request({url:'https://www.googleapis.com/upload/drive/v3/files',method:'POST',params:{uploadType:'resumable',fields:'id'},headers:{'Content-Type':'application/json; charset=utf-8','X-Upload-Content-Type':file.mime_type,'X-Upload-Content-Length':String(file.size_bytes)},data:{id:file.drive_file_id,name:file.original_filename,mimeType:file.mime_type,parents:[config.evidenceFolderId],appProperties:{portalFileId:file.id,hospitalId:file.hospital_id,module:file.record_type}}});
  const location=result.headers.get?.('location')||result.headers.location;fail(validUploadLocation(location),'INVALID_UPLOAD_LOCATION');return location;
 }
 async function generateId(){const r=(await request({url:'https://www.googleapis.com/drive/v3/files/generateIds',method:'GET',params:{count:1,space:'drive',type:'files'}})).data;fail(r.ids?.length===1&&/^[A-Za-z0-9_-]{10,200}$/.test(r.ids[0]),'INVALID_DRIVE_RESPONSE');return r.ids[0];}
 async function chunk(location,data,offset,total,mime='application/pdf'){
  fail(validUploadLocation(location),'INVALID_UPLOAD_LOCATION',400);fail(Buffer.isBuffer(data)&&data.length>0&&data.length<=1024*1024&&Number.isSafeInteger(offset)&&offset>=0&&offset+data.length<=total&&total<=evidenceLimit(mime)&&(offset+data.length===total||data.length%(256*1024)===0),'INVALID_UPLOAD_CHUNK',400);
  if(offset===0)fail(evidenceSignature(data,mime),'INVALID_FILE_CONTENT',400);
  const r=await request({url:location,method:'PUT',headers:{'Content-Type':mime,'Content-Length':String(data.length),'Content-Range':`bytes ${offset}-${offset+data.length-1}/${total}`},data,validateStatus:s=>[200,201,308].includes(s)});
  if([200,201].includes(r.status))return {nextOffset:total,complete:true};const range=r.headers.get?.('range')||r.headers.range;fail(typeof range==='string'&&/^bytes=0-\d+$/.test(range),'INVALID_DRIVE_RESPONSE');return {nextOffset:Number(range.split('-')[1])+1,complete:false};
 }
 async function status(location,total){
  fail(validUploadLocation(location),'INVALID_UPLOAD_LOCATION',400);const r=await request({url:location,method:'PUT',headers:{'Content-Length':'0','Content-Range':'bytes */'+total},data:Buffer.alloc(0),validateStatus:s=>[200,201,308].includes(s)});
  if([200,201].includes(r.status))return {nextOffset:total,complete:true};const range=r.headers.get?.('range')||r.headers.range;fail(!range||/^bytes=0-\d+$/.test(range),'INVALID_DRIVE_RESPONSE');return {nextOffset:range?Number(range.split('-')[1])+1:0,complete:false};
 }
 async function download(file){
  const m=await metadata(file.drive_file_id);const mime=file.mime_type||'application/pdf';privateFile(m,config,mime);fail(Number(m.size)===file.size_bytes&&file.size_bytes<=evidenceLimit(mime)&&m.parents?.length===1&&m.parents[0]===config.evidenceFolderId&&m.appProperties?.portalFileId===file.id,'INVALID_EVIDENCE_FILE',409);
  const result=await request({url:'https://www.googleapis.com/drive/v3/files/'+file.drive_file_id,method:'GET',params:{alt:'media'},responseType:'arraybuffer'}),bytes=Buffer.from(result.data);
  fail(bytes.length===file.size_bytes&&evidenceSignature(bytes,mime)&&createHash('sha256').update(bytes).digest('hex')===file.sha256,'EVIDENCE_CHECKSUM_MISMATCH',409);return bytes;
 }
 return {metadata,generateId,begin,chunk,status,download,verify:async file=>{await download(file);return true;}};
}
