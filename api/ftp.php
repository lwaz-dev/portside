<?php
require __DIR__ . '/../includes/bootstrap.php'; require __DIR__ . '/../includes/remote.php';
set_time_limit(0);
$in = api_guard(); $action = $in['action'] ?? ''; $fs = null;
function mkdirs(RemoteFS $fs, string $base, string $rel): string {
    $cur = $base;
    foreach (array_filter(explode('/', str_replace('\\', '/', $rel)), fn($s) => $s !== '' && $s !== '.' && $s !== '..') as $seg) { $cur = joinPath($cur, $seg); try { $fs->mkdir($cur); } catch (Throwable $e) {} }
    return $cur;
}
try {
    $conn = resolve_connection($in['conn'] ?? '');
    $fs = open_remote($conn);
    $path = (string)($in['path'] ?? '/');
    switch ($action) {
        case 'connect':
            $start = $conn['initial_dir'] ?: '/'; $listing = $fs->listDir($start);
            json_out(['ok' => true, 'path' => $start, 'items' => $listing, 'name' => $conn['name'], 'protocol' => $conn['protocol']]);
        case 'list':
            json_out(['ok' => true, 'path' => $path, 'items' => $fs->listDir($path)]);
        case 'mkdir':
            $fs->mkdir($path); json_out(['ok' => true]);
        case 'newfile':
            $fs->write($path, ''); json_out(['ok' => true]);
        case 'delete':
            foreach ($in['items'] as $it) $fs->delete($it['path'], $it['type'] === 'dir');
            json_out(['ok' => true]);
        case 'rename':
            $fs->rename($in['from'], $in['to']); json_out(['ok' => true]);
        case 'chmod':
            if (!preg_match('/^[0-7]{3,4}$/', (string)$in['mode'])) throw new RuntimeException('Use an octal mode such as 755.');
            foreach ($in['paths'] as $p) $fs->chmod($p, octdec($in['mode']));
            json_out(['ok' => true]);
        case 'read':
            $d = $fs->read($path, 2 * 1024 * 1024);
            if (!preg_match('//u', $d) || str_contains(substr($d, 0, 4096), "\0")) throw new RuntimeException('This looks like a binary file. Download it instead.');
            json_out(['ok' => true, 'content' => $d]);
        case 'write':
            $fs->write($path, (string)$in['content']); json_out(['ok' => true]);
        case 'upload':
            if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
                $codes = [UPLOAD_ERR_INI_SIZE => 'File exceeds upload_max_filesize in php.ini', UPLOAD_ERR_FORM_SIZE => 'File too large', UPLOAD_ERR_PARTIAL => 'Upload was interrupted', UPLOAD_ERR_NO_FILE => 'No file received'];
                throw new RuntimeException($codes[$_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE] ?? 'Upload failed');
            }
            $dir = mkdirs($fs, (string)$in['dir'], dirname((string)($in['rel'] ?? '')) === '.' ? '' : dirname((string)$in['rel']));
            $fs->upload($_FILES['file']['tmp_name'], joinPath($dir, basename((string)($in['rel'] ?: $_FILES['file']['name']))));
            json_out(['ok' => true]);
        case 'download':
            while (ob_get_level()) ob_end_clean();
            header('Content-Type: application/octet-stream');
            header('Content-Disposition: attachment; filename="' . str_replace('"', '', basename($path)) . '"');
            $fs->download($path); exit;
    }
    json_out(['ok' => false, 'error' => 'Unknown action'], 400);
} catch (Throwable $e) {
    json_out(['ok' => false, 'error' => $e->getMessage()], 400);
} finally { if ($fs) $fs->close(); }
