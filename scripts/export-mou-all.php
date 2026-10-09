<?php
declare(strict_types=1);
// Read-only owner CLI export; never installed in the web root.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
ini_set('display_errors','0');error_reporting(0);
$root='/var/www/html/digital_stn/hait-RG12';$level=ob_get_level();$db=null;
try{
 ob_start();require $root.'/conn.php';ob_end_clean();ini_set('display_errors','0');
 $db=pdo();$db->exec('START TRANSACTION READ ONLY');
 $tables=[];
 $columns=['mou_progress'=>'id,hospital_id,item_id,fiscal_year,status,assessment_detail,evidence_type,evidence_file,evidence_link,admin_status,admin_comment,admin_reviewed_at,admin_reviewed_by,updated_at,updated_by','mou_review_history'=>'id,progress_id,admin_status,admin_comment,admin_reviewed_by,created_at'];
 foreach($columns as $table=>$fields){
  $count=(int)$db->query('SELECT COUNT(*) FROM `'.$table.'`')->fetchColumn();
  if($count>20000)throw new RuntimeException();
  $rows=$db->query('SELECT '.$fields.' FROM `'.$table.'` ORDER BY id LIMIT 20001')->fetchAll(PDO::FETCH_ASSOC);
  if(count($rows)!==$count)throw new RuntimeException();$tables[$table]=$rows;
 }
 $db->rollBack();
 fwrite(STDOUT,json_encode(['format'=>'standard-portal-mou-all-v1','exported_at_utc'=>gmdate('c'),'source'=>['host'=>'192.168.0.44','project'=>$root,'read_only'=>true],'tables'=>$tables],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
}catch(Throwable $e){while(ob_get_level()>$level)ob_end_clean();if($db instanceof PDO&&$db->inTransaction())$db->rollBack();fwrite(STDERR,"MOU_ALL_EXPORT_FAILED\n");exit(1);}
