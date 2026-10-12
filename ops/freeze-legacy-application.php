<?php
// Reversible application-directory cutover. No database writes, sudo or service changes.
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
ini_set('display_errors','0');error_reporting(0);
try {
 $apply=in_array('--apply',$argv,true);
 $root='/var/www/html/digital_stn/hait-RG12';
 $home=getenv('HOME');
 if(!in_array($home,['/home/administrator','/root'],true)||realpath($root)!==$root||is_link($root)||!is_writable(dirname($root)))throw new RuntimeException();
 $vault=$home.'/.standard-portal-cutover-20261012';
 if(file_exists($vault))throw new RuntimeException();
 if(stat($root)['dev']!==stat($home)['dev'])throw new RuntimeException();
 $manifest=[];$phpCount=0;$bytes=0;
 $it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root,FilesystemIterator::SKIP_DOTS));
 foreach($it as $f){
  if($f->isLink())throw new RuntimeException();if(!$f->isFile())continue;
  $p=$f->getRealPath();if(!$p||strpos($p,$root.'/')!==0||!is_readable($p))throw new RuntimeException();
  $bytes+=$f->getSize();if($bytes>100*1024*1024)throw new RuntimeException();
  if(strtolower($f->getExtension())==='php')$phpCount++;
  $manifest[]=['path'=>substr($p,strlen($root)+1),'bytes'=>$f->getSize(),'sha256'=>hash_file('sha256',$p)];
 }
 if($phpCount!==49)throw new RuntimeException();
 usort($manifest,static function($a,$b){return strcmp($a['path'],$b['path']);});
 $treeHash=hash('sha256',json_encode($manifest,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
 if($apply){$expected=null;foreach($argv as $arg)if(strpos($arg,'--expect-sha256=')===0)$expected=substr($arg,16);if(!is_string($expected)||!preg_match('/^[a-f0-9]{64}$/',$expected)||!hash_equals($expected,$treeHash))throw new RuntimeException();}
 $report=['mode'=>$apply?'apply':'dry-run','source'=>$root,'privateVault'=>$vault,'files'=>count($manifest),'phpFiles'=>$phpCount,'bytes'=>$bytes,'treeSha256'=>$treeHash,'databaseWrites'=>false,'serviceChanges'=>false];
 if(!$apply){echo json_encode($report,JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR).PHP_EOL;exit;}
 umask(0077);
 if(!mkdir($vault,0700)||!mkdir($vault.'/maintenance',0755))throw new RuntimeException();
 chmod($vault.'/maintenance',0755);
 $html='<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ย้ายไป Standard Portal ใหม่แล้ว</title><style>body{margin:0;background:#f3f8f8;color:#173e49;font:18px/1.8 Tahoma,sans-serif}main{max-width:650px;margin:10vh auto;padding:32px;background:white;border:1px solid #dce9e8;border-radius:20px}h1{font-size:30px;line-height:1.5}a{display:inline-block;background:#007e77;color:white;padding:12px 24px;border-radius:10px;text-decoration:none}small{display:block;margin-top:24px;color:#56747a}@media(max-width:700px){main{margin:24px 16px;padding:24px}h1{font-size:25px}}</style><main><p>สำนักงานสาธารณสุขจังหวัดสตูล</p><h1>ระบบเดิมยุติการใช้งานแล้ว</h1><p>กรุณาใช้งานระบบประเมินสุขภาพดิจิทัลเวอร์ชันใหม่ สำหรับ MOU, CTAM และ HAIT</p><p><a href="https://standard-portal-satun.vercel.app/">เปิด Standard Portal ใหม่ →</a></p><p>เข้าสู่ระบบด้วย Google ผู้ใช้ใหม่ลงทะเบียนและรอผู้ดูแลอนุมัติสิทธิ์ก่อนใช้งาน</p><small>ข้อมูลเดิมเก็บรักษาไว้สำหรับตรวจสอบย้อนหลัง กรุณาติดต่อกลุ่มงานสุขภาพดิจิทัล หากต้องการความช่วยเหลือ</small></main></html>';
 if(file_put_contents($vault.'/maintenance/index.html',$html)===false)throw new RuntimeException();
 chmod($vault.'/maintenance/index.html',0644);
 if(file_put_contents($vault.'/manifest-before.json',json_encode($manifest,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR))===false)throw new RuntimeException();
 if(!rename($root,$vault.'/application'))throw new RuntimeException();
 if(!rename($vault.'/maintenance',$root)){
  if(!rename($vault.'/application',$root))throw new RuntimeException('ROLLBACK_REQUIRED');
  throw new RuntimeException();
 }
 $after=[];
 foreach($manifest as $f){$p=$vault.'/application/'.$f['path'];if(!is_file($p)||filesize($p)!==$f['bytes']||hash_file('sha256',$p)!==$f['sha256'])throw new RuntimeException('VERIFY_REQUIRED');$after[]=$f;}
 if(is_file($root.'/index.php')||is_file($root.'/conn.php')||count(glob($root.'/*.php')?:[])!==0)throw new RuntimeException('VERIFY_REQUIRED');
 $report+=['frozenAt'=>gmdate('c'),'privateCopyVerified'=>true,'maintenanceHtmlSha256'=>hash_file('sha256',$root.'/index.html'),'legacyPhpPresentAtPublicPath'=>false,'rollbackNote'=>'Keep new-system writes paused and reconcile transactions before intentionally restoring the legacy application.'];
 file_put_contents($vault.'/receipt.json',json_encode($report,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
 echo json_encode($report,JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR).PHP_EOL;
}catch(Throwable $e){fwrite(STDERR,'LEGACY_FREEZE_FAILED: '.(in_array($e->getMessage(),['ROLLBACK_REQUIRED','VERIFY_REQUIRED'],true)?$e->getMessage():'PRIVATE_DETAILS_HIDDEN').PHP_EOL);exit(1);}
