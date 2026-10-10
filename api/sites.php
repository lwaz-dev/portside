<?php
require __DIR__ . '/../includes/bootstrap.php'; require __DIR__ . '/../includes/remote.php';
$in = api_guard(); $uid = user_id();
try {
    switch ($in['action'] ?? '') {
        case 'list':
            $f = pdo()->prepare('SELECT id,name,protocol,host,port,username,passive,initial_dir FROM connections WHERE user_id=? ORDER BY name'); $f->execute([$uid]);
            $d = pdo()->prepare('SELECT id,name,host,port,username,default_db FROM db_connections WHERE user_id=? ORDER BY name'); $d->execute([$uid]);
            json_out(['ok' => true, 'ftp' => $f->fetchAll(), 'db' => $d->fetchAll()]);

        case 'save_ftp':
            $proto = in_array($in['protocol'] ?? '', ['ftp', 'ftps', 'sftp'], true) ? $in['protocol'] : 'ftp';
            $name = trim($in['name'] ?? ''); $host = trim($in['host'] ?? ''); $user = trim($in['username'] ?? '');
            if ($name === '' || $host === '' || $user === '') throw new RuntimeException('Name, host and username are required.');
            $port = (int)($in['port'] ?? 0) ?: ($proto === 'sftp' ? 22 : 21); $dir = trim($in['initial_dir'] ?? '') ?: '/'; $pasv = empty($in['passive']) ? 0 : 1;
            if (!empty($in['id'])) {
                $q = pdo()->prepare('UPDATE connections SET name=?,protocol=?,host=?,port=?,username=?,passive=?,initial_dir=? WHERE id=? AND user_id=?');
                $q->execute([$name, $proto, $host, $port, $user, $pasv, $dir, (int)$in['id'], $uid]);
                if (($in['password'] ?? '') !== '') pdo()->prepare('UPDATE connections SET password_enc=? WHERE id=? AND user_id=?')->execute([enc($in['password']), (int)$in['id'], $uid]);
                json_out(['ok' => true, 'id' => (int)$in['id']]);
            }
            pdo()->prepare('INSERT INTO connections (user_id,name,protocol,host,port,username,password_enc,passive,initial_dir) VALUES (?,?,?,?,?,?,?,?,?)')
                ->execute([$uid, $name, $proto, $host, $port, $user, enc((string)($in['password'] ?? '')), $pasv, $dir]);
            json_out(['ok' => true, 'id' => (int)pdo()->lastInsertId()]);

        case 'delete_ftp':
            pdo()->prepare('DELETE FROM connections WHERE id=? AND user_id=?')->execute([(int)$in['id'], $uid]); json_out(['ok' => true]);

        case 'quick':
            $proto = in_array($in['protocol'] ?? '', ['ftp', 'ftps', 'sftp'], true) ? $in['protocol'] : 'ftp';
            $c = ['name' => $in['host'] ?? '', 'protocol' => $proto, 'host' => trim($in['host'] ?? ''), 'port' => (int)($in['port'] ?? 0) ?: ($proto === 'sftp' ? 22 : 21),
                  'username' => $in['username'] ?? '', 'password' => $in['password'] ?? '', 'passive' => 1, 'initial_dir' => '/'];
            if ($c['host'] === '') throw new RuntimeException('Enter a host.');
            $_SESSION['quick'] = enc(json_encode($c)); json_out(['ok' => true]);

        case 'save_db':
            $name = trim($in['name'] ?? ''); $host = trim($in['host'] ?? ''); $user = trim($in['username'] ?? '');
            if ($name === '' || $host === '' || $user === '') throw new RuntimeException('Name, host and username are required.');
            $port = (int)($in['port'] ?? 0) ?: 3306; $ddb = trim($in['default_db'] ?? '');
            if (!empty($in['id'])) {
                pdo()->prepare('UPDATE db_connections SET name=?,host=?,port=?,username=?,default_db=? WHERE id=? AND user_id=?')->execute([$name, $host, $port, $user, $ddb, (int)$in['id'], $uid]);
                if (($in['password'] ?? '') !== '') pdo()->prepare('UPDATE db_connections SET password_enc=? WHERE id=? AND user_id=?')->execute([enc($in['password']), (int)$in['id'], $uid]);
                json_out(['ok' => true, 'id' => (int)$in['id']]);
            }
            pdo()->prepare('INSERT INTO db_connections (user_id,name,host,port,username,password_enc,default_db) VALUES (?,?,?,?,?,?,?)')
                ->execute([$uid, $name, $host, $port, $user, enc((string)($in['password'] ?? '')), $ddb]);
            json_out(['ok' => true, 'id' => (int)pdo()->lastInsertId()]);

        case 'delete_db':
            pdo()->prepare('DELETE FROM db_connections WHERE id=? AND user_id=?')->execute([(int)$in['id'], $uid]); json_out(['ok' => true]);
    }
    json_out(['ok' => false, 'error' => 'Unknown action'], 400);
} catch (Throwable $e) { json_out(['ok' => false, 'error' => $e->getMessage()], 400); }
