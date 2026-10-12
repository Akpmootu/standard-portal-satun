<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
ini_set('display_errors','0');error_reporting(0);
$db=null;
try{
 ob_start();require '/var/www/html/digital_stn/hait-RG12/conn.php';ob_end_clean();$db=pdo();$db->exec('START TRANSACTION READ ONLY');
 $expected=['announcements','c_hosoffice','ctam_items','ctam_progress','ctam_review_history','hait_chapters','hait_responsibles','hait_status','hospitals','mou_categories','mou_items','mou_progress','mou_review_history','mou_settings','notifications','rg12_chapters','rg12_comments','rg12_progress','rg12_sub_items','users'];
 $found=$db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);sort($found);sort($expected);if($found!==$expected)throw new RuntimeException();$tables=[];$omitted=[];
 foreach($expected as $name){
  $headers=array_column($db->query('SHOW COLUMNS FROM `'.$name.'`')->fetchAll(PDO::FETCH_ASSOC),'Field');
  $business=array_values(array_filter($headers,static function($h){return !preg_match('/password|passwd|token|secret|salt|session|api.?key/i',$h);}));
  $omitted[$name]=array_values(array_diff($headers,$business));
  $fields=implode(',',array_map(static function($h){return '`'.str_replace('`','``',$h).'`';},$business));
  $count=(int)$db->query('SELECT COUNT(*) FROM `'.$name.'`')->fetchColumn();if($count>60000)throw new RuntimeException();
  $order=in_array('id',$business,true)?' ORDER BY `id`':($name==='c_hosoffice'?' ORDER BY `hoscode`, `hoscode9new`':'');
  $rows=$db->query('SELECT '.$fields.' FROM `'.$name.'`'.$order.' LIMIT 60001')->fetchAll(PDO::FETCH_NUM);if(count($rows)!==$count)throw new RuntimeException();
  $tables[$name]=['headers'=>$business,'rows'=>$rows];
 }
 $db->rollBack();echo json_encode(['format'=>'standard-portal-source-archive-v1','capturedAt'=>gmdate('c'),'readOnly'=>true,'omittedCredentialColumns'=>$omitted,'tables'=>$tables],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
}catch(Throwable $e){if($db instanceof PDO&&$db->inTransaction())$db->rollBack();fwrite(STDERR,"COMPLETE_ARCHIVE_EXPORT_FAILED\n");exit(1);}
