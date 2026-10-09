<?php
declare(strict_types=1);
// Run from stdin over SSH. Never install this file in the production webroot.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors', '0');
error_reporting(0);
$root = '/var/www/html/digital_stn/hait-RG12';
$ids = ['09604','09605','09606','09607','09608','09609','09610','09611','09612','09613',
 '09614','09615','09616','09617','09618','09619','09620','09621','09622','09623',
 '09624','09625','09626','09627','09628','09629','09630','09631','09632','09633',
 '09634','09635','09636','09637','09638','09639','09640','09641','09642','09643',
 '09644','09645','09646','09647','09648','09649','09650','09651','09652',
 '10746','11402','11403','11404','11405','11406','14096','14097','14098','14715',
 '22015','24058','24672','28786','77654','77707','77708','00070','00872','00873',
 '00874','00875','00876','00877','00878'];
$db = null;
$bufferLevel = ob_get_level();
try {
 ob_start();
 require $root . '/conn.php';
 ob_end_clean();
 ini_set('display_errors', '0');
 $db = pdo();
 $db->exec('START TRANSACTION READ ONLY');
 $marks = implode(',', array_fill(0, count($ids), '?'));
 $hospitalQuery = $db->prepare('SELECT CAST(hoscode AS CHAR) AS id, CAST(hoscode9new AS CHAR) AS reference_id, `ชื่อ` AS name, `ประเภทหน่วยบริการสุขภาพ` AS type FROM c_hosoffice WHERE hoscode IN (' . $marks . ') ORDER BY hoscode');
 $hospitalQuery->execute($ids);
 $groupQuery = $db->prepare('SELECT DISTINCT CAST(hospital_id AS CHAR) AS hospital_id, user_group FROM users WHERE hospital_id IN (' . $marks . ') ORDER BY hospital_id, user_group');
 $groupQuery->execute($ids);
 $result = [
  'format' => 'standard-portal-mou-reference-v1',
  'exported_at_utc' => gmdate('c'),
  'source' => ['host' => '192.168.0.44', 'project' => $root, 'read_only' => true],
  'hospitals' => $hospitalQuery->fetchAll(PDO::FETCH_ASSOC),
  // Agency classification only: not users, identities, roles, or approval records.
  'agency_groups' => $groupQuery->fetchAll(PDO::FETCH_ASSOC),
  'mou_categories' => $db->query('SELECT CAST(id AS CHAR) AS id, category_number, title, sort_order FROM mou_categories ORDER BY sort_order, id')->fetchAll(PDO::FETCH_ASSOC),
  'mou_items' => $db->query('SELECT CAST(id AS CHAR) AS id, CAST(category_id AS CHAR) AS category_id, item_number, title, target_group, period, sort_order FROM mou_items ORDER BY sort_order, id')->fetchAll(PDO::FETCH_ASSOC),
  'mou_settings' => $db->query("SELECT CAST(id AS CHAR) AS id, setting_key, setting_value, label, updated_at FROM mou_settings WHERE setting_key IN ('allow_6months_edit','allow_9_12months_edit') ORDER BY id")->fetchAll(PDO::FETCH_ASSOC),
 ];
 $db->rollBack();
 $json = json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
 fwrite(STDOUT, $json);
} catch (Throwable $error) {
 while (ob_get_level() > $bufferLevel) { ob_end_clean(); }
 if ($db instanceof PDO && $db->inTransaction()) { $db->rollBack(); }
 fwrite(STDERR, "REFERENCE_EXPORT_FAILED\n");
 exit(1);
}
