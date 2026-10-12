import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {referenceSshArgs} from './reference-ssh-options.js';
const paths={'assets/docs/คู่มือมาตรฐานหน่วยบริการปฐมภูมิ 68-70 V.2.pdf':'pcu-guideline.pdf','assets/docs/ctam_guideline.pdf':'ctam-guideline.pdf','assets/images/logo.png':'logo.png','assets/images/favicon.png':'favicon.png','assets/images/home-hero-digital-health.png':'home-hero.png','คู่มือการตรวจประเมินระดับการรักษาความมั.pdf':'ctam-guideline-root.pdf'};
try{
 const php='<?php $root="/var/www/html/digital_stn/hait-RG12/";$out=[];foreach(json_decode(base64_decode("'+Buffer.from(JSON.stringify(Object.keys(paths))).toString('base64')+'"),true) as $p){$b=file_get_contents($root.$p);if($b===false||strlen($b)>10485760)exit(1);$out[]=["path"=>$p,"bytes"=>strlen($b),"sha256"=>hash("sha256",$b),"base64"=>base64_encode($b)];}echo json_encode($out);';
 const r=spawnSync('C:/Windows/System32/OpenSSH/ssh.exe',referenceSshArgs(...process.argv.slice(2)),{input:php,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:24*1024*1024});if(r.status!==0)throw Error();
 const folder='.migration/complete-archive/assets';await mkdir(folder,{recursive:true});const files=[];
 for(const f of JSON.parse(r.stdout)){if(!Object.hasOwn(paths,f.path))throw Error();const bytes=Buffer.from(f.base64,'base64');if(bytes.length!==f.bytes||createHash('sha256').update(bytes).digest('hex')!==f.sha256)throw Error();await writeFile(folder+'/'+paths[f.path],bytes,{flag:'wx',mode:0o600});files.push({sourcePath:f.path,localName:paths[f.path],bytes:f.bytes,sha256:f.sha256});}
 await writeFile('.migration/complete-archive/assets.json',JSON.stringify(files,null,2)+'\n');console.log(JSON.stringify({sourceFiles:files.length,uniqueFiles:new Set(files.map(f=>f.sha256)).size,bytes:files.reduce((n,f)=>n+f.bytes,0),readOnly:true}));
}catch{console.error('ASSET_EXPORT_FAILED: NO_PRIVATE_DETAILS');process.exitCode=1;}
