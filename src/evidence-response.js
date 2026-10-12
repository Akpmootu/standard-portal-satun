import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
export async function evidenceResponse(res,file,bytes){
 res.writeHead(200,{'Content-Type':file.mime_type||'application/pdf','X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="evidence"; filename*=UTF-8''${encodeURIComponent(file.original_filename)}`});
 res.flushHeaders();
 async function* chunks(){for(let i=0;i<bytes.length;i+=64*1024)yield bytes.subarray(i,Math.min(bytes.length,i+64*1024));}
 try{await pipeline(Readable.from(chunks()),res);}catch{res.destroy();}
}
