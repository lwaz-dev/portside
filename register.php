<?php
require __DIR__ . '/includes/bootstrap.php'; require __DIR__ . '/includes/layout.php';
$err = '';
if (!cfg('open_registration')) { http_response_code(403); exit('Registration is closed.'); }
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = trim($_POST['name'] ?? ''); $email = strtolower(trim($_POST['email'] ?? '')); $pw = $_POST['password'] ?? '';
    if (!hash_equals(csrf(), (string)($_POST['_csrf'] ?? ''))) $err = 'Security token mismatch. Reload and try again.';
    elseif ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) $err = 'Enter your name and a valid email address.';
    elseif (strlen($pw) < 8) $err = 'Use a password of at least 8 characters.';
    else try {
        $s = pdo()->prepare('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)');
        $s->execute([$name, $email, password_hash($pw, PASSWORD_DEFAULT)]);
        session_regenerate_id(true); $_SESSION['uid'] = (int)pdo()->lastInsertId(); $_SESSION['uname'] = $name;
        header('Location: index.php'); exit;
    } catch (PDOException $e) { $err = $e->getCode() === '23000' ? 'That email already has an account.' : 'Database error. Run install.php first, and check config.php.'; }
}
page_head('Create account', '', false); ?>
<main class="card-auth">
  <h1>Create your Portside account</h1>
  <?php if ($err): ?><p class="err"><?= h($err) ?></p><?php endif; ?>
  <form method="post">
    <input type="hidden" name="_csrf" value="<?= h(csrf()) ?>">
    <label>Name<input name="name" required autofocus value="<?= h($_POST['name'] ?? '') ?>"></label>
    <label>Email<input type="email" name="email" required value="<?= h($_POST['email'] ?? '') ?>"></label>
    <label>Password<input type="password" name="password" required minlength="8"></label>
    <button class="btn primary">Create account</button>
  </form>
  <p class="alt">Already registered? <a href="login.php">Sign in</a></p>
</main></body></html>
