<?php
// Read-only inventory. Run as the authorized server operator; never invokes sudo.
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
ini_set('display_errors','0');error_reporting(0);
$root='/var/www/html/digital_stn/hait-RG12';
$pattern='~hait-RG12|cron_(?:daily_summary|deadline_reminder|weekly_summary)\.php~i';
$report=['readOnly'=>true,'capturedAt'=>date('c'),'runningAsRoot'=>function_exists('posix_geteuid')&&posix_geteuid()===0,'applicationWrites'=>false,'databaseAccess'=>false,'cronLocations'=>[],'matchingJobs'=>[],'systemdUnits'=>[]];
$locations=['/etc/crontab','/etc/cron.d','/var/spool/cron/crontabs','/var/spool/cron'];
foreach($locations as $location){
 $readable=is_readable($location);$report['cronLocations'][]=['path'=>$location,'exists'=>file_exists($location),'readable'=>$readable];
 if(!$readable)continue;
 $paths=is_dir($location)?(glob($location.'/*')?:[]):[$location];
 foreach($paths as $path){
  if(!is_file($path)||!is_readable($path)||filesize($path)>1048576)continue;
  foreach(file($path,FILE_IGNORE_NEW_LINES)?:[] as $index=>$line){
   if(preg_match('/^\s*#/',$line)||!preg_match($pattern,$line))continue;
   preg_match_all('/\bcron_(?:daily_summary|deadline_reminder|weekly_summary)\.php\b/',$line,$names);
   $report['matchingJobs'][]=['file'=>$path,'lineNumber'=>$index+1,'lineSha256'=>hash('sha256',$line),'scripts'=>array_values(array_unique($names[0]))];
  }
 }
}
foreach(['/etc/systemd/system','/usr/lib/systemd/system','/lib/systemd/system'] as $dir){
 if(!is_readable($dir))continue;
 foreach(glob($dir.'/*')?:[] as $path){
  if(!is_file($path)||!is_readable($path)||filesize($path)>1048576||!preg_match('/\.(?:timer|service)$/',$path))continue;
  $text=file_get_contents($path);if($text!==false&&preg_match($pattern,$text))$report['systemdUnits'][]=['path'=>$path,'sha256'=>hash('sha256',$text)];
 }
}
$vhost='/etc/nginx/sites-enabled/hait-status.conf';
$report['vhost']=['path'=>$vhost,'readable'=>is_readable($vhost),'writable'=>is_writable($vhost),'sha256'=>is_readable($vhost)?hash_file('sha256',$vhost):null];
$report['limitations']=['No jobs disabled; no Nginx configuration changed or reloaded.','Operator must review nested unit drop-ins, containers, application workers and external HTTP schedulers separately.','A root report and operator acknowledgement are required; an unprivileged inventory is not complete cron coverage.'];
echo json_encode($report,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR).PHP_EOL;
