<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
ini_set('display_errors','0');error_reporting(0);
// Inventory only: do not include application code, connect to DB, or run a cron.
try{
 $root=realpath('/var/www/html/digital_stn/hait-RG12');if($root===false)throw new RuntimeException();
 $entries=[];$it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS));
 foreach($it as $f){
  if($f->isLink()||!$f->isFile()||strtolower($f->getExtension())!=='php')continue;
  $p=$f->getRealPath();if($p===false||strpos($p,$root.'/')!==0||$f->getSize()>1048576)throw new RuntimeException();
  $name=substr($p,strlen($root)+1);$body=file_get_contents($p);if($body===false)throw new RuntimeException();
  $entries[]=['path'=>$name,'sha256'=>hash('sha256',$body),'sharedFunctionsMentioned'=>strpos($body,'functions.php')!==false,'isCron'=>strpos(basename($name),'cron_')===0];
 }usort($entries,static function($a,$b){return strcmp($a['path'],$b['path']);});
 $apache=[];foreach(glob('/etc/apache2/sites-enabled/*')?:[] as $p){
  if(!is_readable($p))continue;$body=file_get_contents($p);if($body===false)continue;
  $apache[]=['file'=>basename($p),'sha256'=>hash('sha256',$body),'mentionsApplication'=>strpos($body,$root)!==false,'mentionsParent'=>strpos($body,'/var/www/html')!==false,'hasAllowOverrideAll'=>preg_match('/^\s*AllowOverride\s+All\s*$/mi',$body)===1];
 }
 $cron=[];$cronFiles=glob('/etc/cron.d/*')?:[];
 foreach($cronFiles as $p){if(!is_file($p)||!is_readable($p))continue;foreach(file($p,FILE_IGNORE_NEW_LINES)?:[] as $line){
  if(preg_match('/^\s*#/',$line)||strpos($line,$root.'/')===false)continue;
  preg_match_all('/\bcron_[A-Za-z0-9_-]+\.php\b/',$line,$m);
  $cron[]=['file'=>basename($p),'scripts'=>array_values(array_unique($m[0]))];
 }}
 echo json_encode(['readOnly'=>true,'capturedAt'=>date('c'),'root'=>$root,'phpFiles'=>$entries,'appHtaccessExists'=>is_file($root.'/.htaccess'),'apacheSites'=>$apache,'systemCronReferences'=>$cron,'cronCoverage'=>'Readable /etc/cron.d only; user/root crontabs and external schedulers NOT checked.','sourceWrites'=>false,'databaseAccess'=>false],JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
}catch(Throwable $e){fwrite(STDERR,"LEGACY_CUTOVER_INSPECTION_FAILED\n");exit(1);}
