<?php
function page_head(string $title, string $active = '', bool $app = true): void { ?>
<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="csrf" content="<?= h(csrf()) ?>">
<title><?= h($title) ?> · Portside</title>
<link rel="stylesheet" href="assets/app.css">
</head><body class="<?= $app ? 'app' : 'auth' ?>">
<?php if ($app): ?>
<header class="top">
  <a class="brand" href="index.php"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17h18M6 17V9l6-5 6 5v8M10 17v-5h4v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>Portside</a>
  <nav>
    <a href="index.php" class="<?= $active === 'files' ? 'on' : '' ?>">File transfer</a>
    <a href="db.php" class="<?= $active === 'db' ? 'on' : '' ?>">Databases</a>
  </nav>
  <div class="who"><?= h($_SESSION['uname'] ?? '') ?> <a href="logout.php">Sign out</a></div>
</header>
<?php endif;
}
