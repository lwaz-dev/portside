<?php
$cfg = require __DIR__ . '/config.php';
$msg = ''; $ok = false;
try {
    $c = $cfg['db'];
    $pdo = new PDO("mysql:host={$c['host']};charset={$c['charset']}", $c['user'], $c['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    // On cPanel the database already exists (you create it in "MySQL Databases"); this is harmless there.
    try { $pdo->exec("CREATE DATABASE IF NOT EXISTS `" . str_replace('`', '', $c['name']) . "` CHARACTER SET utf8mb4"); } catch (Throwable $e) {}
    $pdo->exec("USE `" . str_replace('`', '', $c['name']) . "`");
    foreach (array_filter(array_map('trim', explode(';', file_get_contents(__DIR__ . '/schema.sql')))) as $sql) $pdo->exec($sql);
    $ok = true; $msg = 'Tables are ready.';
} catch (Throwable $e) { $msg = $e->getMessage(); }
if ($cfg['app_key'] === 'CHANGE_ME_TO_A_LONG_RANDOM_STRING') $msg .= ' Warning: set app_key in config.php before creating accounts.';
?><!doctype html><meta charset="utf-8"><title>Portside install</title>
<body style="font:16px system-ui;max-width:560px;margin:60px auto;padding:0 20px">
<h1>Portside setup</h1>
<p style="color:<?= $ok ? '#0a6' : '#c2410c' ?>"><?= htmlspecialchars($msg) ?></p>
<?php if ($ok): ?><p><a href="register.php">Create your account</a>, then delete <code>install.php</code> from the server.</p><?php endif; ?>
</body>
