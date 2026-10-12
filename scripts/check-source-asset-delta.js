import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {referenceSshArgs} from './reference-ssh-options.js';

try {
 const baseline=JSON.parse(await readFile('.migration/complete-archive/assets.json','utf8'));
 const frozenRoot=process.argv[4];
 if(frozenRoot!==undefined&&!/^\/home\/administrator\/\.standard-portal-cutover-\d{8}\/application$/.test(frozenRoot))throw Error('INVALID_FROZEN_ROOT');
 let php=`<?php
 ini_set('display_errors','0'); error_reporting(0);
 $root=realpath('/var/www/html/digital_stn/hait-RG12'); if(!$root)exit(1);
 $files=[]; $it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS));
 foreach($it as $f){
  if($f->isLink()||!$f->isFile()||!preg_match('/^(pdf|png|jpe?g|webp|gif|docx?|xlsx?|pptx?)$/i',$f->getExtension()))continue;
  $p=$f->getRealPath(); if(!$p||strpos($p,$root.'/')!==0||!is_readable($p))exit(1);
  if(count($files)>=2000)exit(1);
  $files[]=['sourcePath'=>substr($p,strlen($root)+1),'bytes'=>$f->getSize(),'sha256'=>hash_file('sha256',$p)];
 }
 usort($files,static function($a,$b){return strcmp($a['sourcePath'],$b['sourcePath']);});
 echo json_encode(['readOnly'=>true,'capturedAt'=>date('c'),'files'=>$files],JSON_THROW_ON_ERROR);`;
 if(frozenRoot)php=php.replace('/var/www/html/digital_stn/hait-RG12',frozenRoot);
 const result=spawnSync('C:/Windows/System32/OpenSSH/ssh.exe',referenceSshArgs(...process.argv.slice(2,4)),{input:php,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4*1024*1024});
 if(result.status!==0)throw Error('SOURCE_READ_FAILED');
 const current=JSON.parse(result.stdout); if(current.readOnly!==true||!Array.isArray(current.files))throw Error('INVALID_INVENTORY');
 const comparison=baseline.map(old=>{const fresh=current.files.find(f=>f.sourcePath===old.sourcePath);return {sourcePath:old.sourcePath,exists:!!fresh,bytesEqual:fresh?.bytes===old.bytes,hashEqual:fresh?.sha256===old.sha256};});
 const unaccounted=current.files.filter(f=>!baseline.some(b=>b.sourcePath===f.sourcePath));
 const report={readOnly:true,usingFrozenApplicationRoot:!!frozenRoot,capturedAt:current.capturedAt,recognizedSourcePaths:baseline.length,currentSourcePaths:current.files.length,allRecognizedBytesAndHashesEqual:comparison.every(c=>c.exists&&c.bytesEqual&&c.hashEqual),unaccountedSourcePaths:unaccounted.length,comparison,unaccounted,scope:'All regular PDF, raster image and Office document files recursively under retained legacy application. Symlinks skipped; no file contents exported.'};
 await mkdir('.migration',{recursive:true});
 const path='.migration/source-asset-delta-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
 await writeFile(path,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({path,readOnly:true,capturedAt:report.capturedAt,recognizedSourcePaths:report.recognizedSourcePaths,currentSourcePaths:report.currentSourcePaths,allRecognizedBytesAndHashesEqual:report.allRecognizedBytesAndHashesEqual,unaccountedSourcePaths:report.unaccountedSourcePaths}));
 if(!report.allRecognizedBytesAndHashesEqual||unaccounted.length)process.exitCode=2;
}catch{console.error('SOURCE_ASSET_DELTA_FAILED: PRIVATE_DETAILS_HIDDEN');process.exitCode=1;}
