export const MAX_IMAGE_BYTES=2*1024*1024;
export const MAX_LEGACY_PDF_BYTES=10*1024*1024;
export function imageMime(filename){
 if(typeof filename!=='string')return '';
 return /\.jpe?g$/i.test(filename)?'image/jpeg':/\.png$/i.test(filename)?'image/png':/\.webp$/i.test(filename)?'image/webp':'';
}
export function evidenceLimit(mime){return mime==='application/pdf'?MAX_LEGACY_PDF_BYTES:['image/jpeg','image/png','image/webp'].includes(mime)?MAX_IMAGE_BYTES:0;}
export function evidenceSignature(bytes,mime){
 const at=(offset,values)=>values.every((v,i)=>bytes[offset+i]===v);
 if(mime==='application/pdf')return at(0,[37,80,68,70,45]);
 if(mime==='image/jpeg')return at(0,[255,216,255]);
 if(mime==='image/png')return at(0,[137,80,78,71,13,10,26,10]);
 if(mime==='image/webp')return at(0,[82,73,70,70])&&at(8,[87,69,66,80]);
 return false;
}
