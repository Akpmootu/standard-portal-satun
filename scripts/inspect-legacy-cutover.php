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
 $web=[];$patterns=['/etc/nginx/nginx.conf','/etc/nginx/conf.d/*','/etc/nginx/sites-enabled/*','/etc/httpd/conf/httpd.conf','/etc/httpd/conf.d/*','/etc/apache2/httpd.conf','/etc/apache2/conf.d/*','/etc/apache2/vhosts.d/*','/usr/local/lsws/conf/httpd_config.conf'];
 foreach($patterns as $pattern)foreach(glob($pattern)?:[] as $p){
  if(!is_file($p)||!is_readable($p)||filesize($p)>1048576)continue;$body=file_get_contents($p);if($body===false)continue;
  preg_match_all('/^\s*(?:root|DocumentRoot|Alias|include|Include|IncludeOptional|location|AllowOverride)\s+[^\r\n#]+/mi',$body,$m);
  $web[]=['file'=>$p,'sha256'=>hash('sha256',$body),'routingDirectives'=>array_map('trim',$m[0])];
 }
 $processes=[];foreach(glob('/proc/[0-9]*/comm')?:[] as $p){$name=trim((string)@file_get_contents($p));if(preg_match('/^(nginx|apache2|httpd|caddy|lshttpd|php-fpm.*|cron|crond)$/',$name))$processes[$name]=true;}
 $cron=[];$cronFiles=glob('/etc/cron.d/*')?:[];
 foreach($cronFiles as $p){if(!is_file($p)||!is_readable($p))continue;foreach(file($p,FILE_IGNORE_NEW_LINES)?:[] as $line){
  if(preg_match('/^\s*#/',$line)||strpos($line,$root.'/')===false)continue;
  preg_match_all('/\bcron_[A-Za-z0-9_-]+\.php\b/',$line,$m);
  $cron[]=['file'=>basename($p),'scripts'=>array_values(array_unique($m[0]))];
 }}
 $userCron=['checked'=>false,'matchingJobs'=>[]];$rootCron=['checked'=>false,'matchingJobs'=>[]];
 if(function_exists('proc_open')){
  foreach(['current'=>['crontab','-l'],'root'=>['sudo','-n','crontab','-l','-u','root']] as $who=>$command){
   $item=['checked'=>false,'matchingJobs'=>[]];$pipes=[];$proc=@proc_open($command,[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);
   if(is_resource($proc)){fclose($pipes[0]);$text=stream_get_contents($pipes[1]);fclose($pipes[1]);$err=stream_get_contents($pipes[2]);fclose($pipes[2]);$status=proc_close($proc);$item['checked']=$status===0||($status===1&&strpos($err,'no crontab for')!==false);$item['exitCode']=$status;$item['empty']=$status===1&&strpos($err,'no crontab for')!==false;
    if($status===0)foreach(explode("\n",$text) as $line){if(preg_match('/^\s*#/',$line)||!preg_match('~hait-RG12|'.preg_quote($root,'~').'~i',$line))continue;preg_match_all('/\b(?:cron_[A-Za-z0-9_-]+|test_telegram)\.php\b/',$line,$m);$item['matchingJobs'][]=['sha256'=>hash('sha256',$line),'scripts'=>array_values(array_unique($m[0]))];}
   }
   if($who==='root')$rootCron=$item;else $userCron=$item;
  }
 }
 echo json_encode(['readOnly'=>true,'capturedAt'=>date('c'),'root'=>$root,'phpFiles'=>$entries,'appHtaccessExists'=>is_file($root.'/.htaccess'),'apacheSites'=>$apache,'webConfigurations'=>$web,'runningServiceNames'=>array_keys($processes),'systemCronReferences'=>$cron,'currentUserCrontab'=>$userCron,'rootCrontab'=>$rootCron,'cronCoverage'=>'Readable /etc/cron.d, current SSH user and existing non-interactive sudo root-crontab read attempted; other-user crontabs, systemd timers, containers and external schedulers NOT comprehensively checked.','sourceWrites'=>false,'databaseAccess'=>false],JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
}catch(Throwable $e){fwrite(STDERR,"LEGACY_CUTOVER_INSPECTION_FAILED\n");exit(1);}
