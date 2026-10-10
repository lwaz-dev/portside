<?php
declare(strict_types=1);
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => !empty($_SERVER['HTTPS'])]);
session_start();
$GLOBALS['CONFIG'] = require __DIR__ . '/../config.php';
function cfg(string $k) { return $GLOBALS['CONFIG'][$k]; }

function pdo(): PDO {
    static $p = null;
    if (!$p) {
        $c = cfg('db');
        $p = new PDO("mysql:host={$c['host']};dbname={$c['name']};charset={$c['charset']}", $c['user'], $c['pass'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    }
    return $p;
}

/* ---- encryption for saved passwords (AES-256-GCM) ---- */
function enc(string $s): string {
    $key = hash('sha256', cfg('app_key'), true); $iv = random_bytes(12); $tag = '';
    $ct = openssl_encrypt($s, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    return base64_encode($iv . $tag . $ct);
}
function dec(string $s): string {
    $raw = base64_decode($s, true); if ($raw === false || strlen($raw) < 28) throw new RuntimeException('Saved password is unreadable');
    $key = hash('sha256', cfg('app_key'), true);
    $p = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    if ($p === false) throw new RuntimeException('Cannot decrypt saved password. Was app_key changed?');
    return $p;
}

/* ---- auth / csrf ---- */
function csrf(): string { if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32)); return $_SESSION['csrf']; }
function user_id(): ?int { return isset($_SESSION['uid']) ? (int)$_SESSION['uid'] : null; }
function require_login(): void { if (!user_id()) { header('Location: login.php'); exit; } }
function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

function json_out(array $d, int $code = 200): never {
    http_response_code($code); header('Content-Type: application/json; charset=utf-8');
    echo json_encode($d, JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR); exit;
}
function api_guard(): array {
    if (!user_id()) json_out(['ok' => false, 'error' => 'Your session expired. Sign in again.'], 401);
    $t = $_SERVER['HTTP_X_CSRF'] ?? ($_REQUEST['_csrf'] ?? '');
    if (!hash_equals(csrf(), (string)$t)) json_out(['ok' => false, 'error' => 'Security token mismatch. Reload the page.'], 419);
    $in = [];
    if (str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) $in = json_decode(file_get_contents('php://input'), true) ?: [];
    return $in + $_REQUEST;
}

/* ---- block internal hosts when allow_private_hosts = false ---- */
function check_host(string $host): void {
    if (cfg('allow_private_hosts')) return;
    $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : (gethostbynamel($host) ?: []);
    if (!$ips) throw new RuntimeException("Cannot resolve host $host");
    foreach ($ips as $ip)
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE))
            throw new RuntimeException('Connecting to private or local addresses is disabled on this server.');
}
