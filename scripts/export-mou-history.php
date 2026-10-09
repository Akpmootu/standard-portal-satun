<?php
declare(strict_types=1);
// Owner CLI over SSH stdin only. Never install this helper in the web root.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors', '0'); error_reporting(0);
$root = '/var/www/html/digital_stn/hait-RG12';
$year = 2569;
$ids = json_decode('__PROJECT_IDS_JSON__', true);
$db = null; $bufferLevel = ob_get_level();
try {
 if (!is_array($ids) || count($ids) !== 74) { throw new RuntimeException(); }
 ob_start(); require $root . '/conn.php'; ob_end_clean(); ini_set('display_errors', '0');
 $db = pdo(); $db->exec('START TRANSACTION READ ONLY');
 // Year belongs to the parent assessment, not to the event's calendar date.
 $from = ' FROM mou_review_history h JOIN mou_progress p ON p.id = h.progress_id';
 $where = ' WHERE p.fiscal_year = ? AND p.hospital_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
 $params = array_merge([$year], $ids);
 $countQuery = $db->prepare('SELECT COUNT(*)' . $from . $where);
 $countQuery->execute($params); $count = (int)$countQuery->fetchColumn();
 if ($count > 5000) { throw new RuntimeException(); }
 $query = $db->prepare('SELECT CAST(h.id AS CHAR) AS id, CAST(h.progress_id AS CHAR) AS progress_id,
 CAST(p.hospital_id AS CHAR) AS hospital_id, CAST(p.item_id AS CHAR) AS item_id, p.fiscal_year,
 h.admin_status, h.admin_comment, h.admin_reviewed_by, h.created_at' . $from . $where . ' ORDER BY h.created_at, h.id LIMIT 5001');
 $query->execute($params); $records = $query->fetchAll(PDO::FETCH_ASSOC);
 if (count($records) !== $count) { throw new RuntimeException(); }
 $result = ['format'=>'standard-portal-mou-history-v1','exported_at_utc'=>gmdate('c'),
  'source'=>['host'=>'192.168.0.44','project'=>$root,'read_only'=>true],
  'fiscal_year'=>$year,'source_count'=>$count,'records'=>$records];
 $db->rollBack();
 fwrite(STDOUT, json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
} catch (Throwable $error) {
 while (ob_get_level() > $bufferLevel) { ob_end_clean(); }
 if ($db instanceof PDO && $db->inTransaction()) { $db->rollBack(); }
 fwrite(STDERR, "MOU_HISTORY_EXPORT_FAILED\n"); exit(1);
}
