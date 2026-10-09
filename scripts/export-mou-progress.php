<?php
declare(strict_types=1);
// Owner CLI over SSH stdin only. Never install in the production web root.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors', '0'); error_reporting(0);
$root = '/var/www/html/digital_stn/hait-RG12';
$year = 2569;
// A fixed project ID list is inserted by the local helper, never taken from a URL.
$ids = json_decode('__PROJECT_IDS_JSON__', true);
$db = null; $bufferLevel = ob_get_level();
try {
 if (!is_array($ids) || count($ids) !== 74) { throw new RuntimeException(); }
 ob_start(); require $root . '/conn.php'; ob_end_clean(); ini_set('display_errors', '0');
 $db = pdo(); $db->exec('START TRANSACTION READ ONLY');
 $where = 'fiscal_year = ? AND hospital_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
 $params = array_merge([$year], $ids);
 $countQuery = $db->prepare('SELECT COUNT(*) FROM mou_progress WHERE ' . $where);
 $countQuery->execute($params); $count = (int)$countQuery->fetchColumn();
 if ($count > 5000) { throw new RuntimeException(); }
 $query = $db->prepare("SELECT CAST(id AS CHAR) AS id, CAST(hospital_id AS CHAR) AS hospital_id,
 CAST(item_id AS CHAR) AS item_id, fiscal_year, status, assessment_detail, evidence_type,
 CASE WHEN evidence_file IS NOT NULL AND evidence_file <> '' THEN 1 ELSE 0 END AS has_legacy_file,
 evidence_link, admin_status, admin_comment, admin_reviewed_at, admin_reviewed_by, updated_at,
 CAST(updated_by AS CHAR) AS updated_by FROM mou_progress WHERE " . $where . ' ORDER BY hospital_id, item_id, id LIMIT 5001');
 $query->execute($params); $records = $query->fetchAll(PDO::FETCH_ASSOC);
 foreach ($records as &$record) { $record['has_legacy_file'] = (bool)$record['has_legacy_file']; }
 unset($record);
 if (count($records) !== $count) { throw new RuntimeException(); }
 $result = ['format'=>'standard-portal-mou-progress-v1','exported_at_utc'=>gmdate('c'),
  'source'=>['host'=>'192.168.0.44','project'=>$root,'read_only'=>true],
  'fiscal_year'=>$year,'source_count'=>$count,'records'=>$records];
 $db->rollBack();
 fwrite(STDOUT, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
} catch (Throwable $error) {
 while (ob_get_level() > $bufferLevel) { ob_end_clean(); }
 if ($db instanceof PDO && $db->inTransaction()) { $db->rollBack(); }
 fwrite(STDERR, "MOU_PROGRESS_EXPORT_FAILED\n"); exit(1);
}
