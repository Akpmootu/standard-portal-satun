<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors', '0'); error_reporting(0);
$root='/var/www/html/digital_stn/hait-RG12'; $db=null; $level=ob_get_level();
try {
 ob_start(); require $root.'/conn.php'; ob_end_clean(); ini_set('display_errors','0');
 $db=pdo(); $db->exec('START TRANSACTION READ ONLY');
 // Explicit columns: never export password, secrets, tokens or account credentials.
 $columns=[
 'ctam_items'=>'id,item_number,title,title_en,description,sort_order,created_at',
 'ctam_progress'=>'id,hospital_id,item_id,responsible_person,assessment_detail,evidence_type,evidence_file,evidence_link,updated_at,updated_by,status,admin_status,admin_comment,admin_reviewed_at,admin_reviewed_by',
 'ctam_review_history'=>'id,progress_id,admin_status,admin_comment,admin_reviewed_by,created_at',
 'rg12_chapters'=>'id,chapter_number,title,sort_order,created_at',
 'rg12_sub_items'=>'id,chapter_id,item_text,sort_order',
 'rg12_progress'=>'id,hospital_id,sub_item_id,is_completed,status,responsible_person,assessment_detail,evidence_type,evidence_file,evidence_link,admin_status,admin_comment,admin_reviewed_at,admin_reviewed_by,updated_at,updated_by',
 'rg12_comments'=>'id,hospital_id,chapter_id,comment_text,needs_provincial_help,admin_response,created_at,updated_at,admin_responded_at,admin_responded_by',
 'announcements'=>'id,title,message,link_url,link_text,is_active,created_at,updated_at',
 'notifications'=>'id,user_id,hospital_id,type,title,message,related_type,related_item_id,is_read,created_at',
 'users'=>'id,username,role,user_group,last_login_at,hospital_id,created_at'
 ];
 $tables=[];
 foreach($columns as $table=>$fields){
  $count=(int)$db->query('SELECT COUNT(*) FROM `'.$table.'`')->fetchColumn();
  if($count>20000)throw new RuntimeException();
  $rows=$db->query('SELECT '.$fields.' FROM `'.$table.'` ORDER BY id LIMIT 20001')->fetchAll(PDO::FETCH_ASSOC);
  if(count($rows)!==$count)throw new RuntimeException();
  $tables[$table]=$rows;
 }
 $db->rollBack();
 fwrite(STDOUT,json_encode(['format'=>'standard-portal-remaining-v1','exported_at_utc'=>gmdate('c'),'source'=>['host'=>'192.168.0.44','project'=>$root,'read_only'=>true],'tables'=>$tables],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
}catch(Throwable $e){while(ob_get_level()>$level)ob_end_clean();if($db instanceof PDO&&$db->inTransaction())$db->rollBack();fwrite(STDERR,"REMAINING_EXPORT_FAILED\n");exit(1);}
