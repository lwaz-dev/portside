<?php
require __DIR__ . '/includes/bootstrap.php'; require __DIR__ . '/includes/layout.php';
$err = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals(csrf(), (string)($_POST['_csrf'] ?? ''))) $err = 'Security token mismatch. Reload and try again.';
    else try {
        $s = pdo()->prepare('SELECT * FROM users WHERE email = ?'); $s->execute([strtolower(trim($_POST['email'] ?? ''))]); $u = $s->fetch();
        if ($u && password_verify($_POST['password'] ?? '', $u['password_hash'])) {
            session_regenerate_id(true); $_SESSION['uid'] = (int)$u['id']; $_SESSION['uname'] = $u['name']; header('Location: index.php'); exit;
        }
        usleep(400000); $err = 'Email or password is incorrect.';
    } catch (Throwable $e) { $err = 'Database error. Run install.php first, and check config.php.'; }
}
page_head('Sign in', '', false); ?>
<main class="card-auth">
  <h1>Sign in to Portside</h1>
  <?php if ($err): ?><p class="err"><?= h($err) ?></p><?php endif; ?>
  <form method="post">
    <input type="hidden" name="_csrf" value="<?= h(csrf()) ?>">
    <label>Email<input type="email" name="email" required autofocus></label>
    <label>Password<input type="password" name="password" required></label>
    <button class="btn primary">Sign in</button>
  </form>
  <?php if (cfg('open_registration')): ?><p class="alt">New here? <a href="register.php">Create an account</a></p><?php endif; ?>
</main></body></html>
