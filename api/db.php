<?php
require __DIR__ . '/../includes/bootstrap.php';
set_time_limit(120);
$in = api_guard(); $action = $in['action'] ?? '';

const COL_TYPES = ['TINYINT','SMALLINT','MEDIUMINT','INT','BIGINT','DECIMAL','FLOAT','DOUBLE','BIT','BOOLEAN','CHAR','VARCHAR','TINYTEXT','TEXT','MEDIUMTEXT','LONGTEXT',
    'BINARY','VARBINARY','TINYBLOB','BLOB','MEDIUMBLOB','LONGBLOB','DATE','TIME','DATETIME','TIMESTAMP','YEAR','ENUM','SET','JSON'];
const NUMERIC = ['TINYINT','SMALLINT','MEDIUMINT','INT','BIGINT','DECIMAL','FLOAT','DOUBLE'];

function qi(string $n): string { if ($n === '') throw new RuntimeException('A name is required.'); return '`' . str_replace('`', '``', $n) . '`'; }
function qt(string $db, string $t): string { return qi($db) . '.' . qi($t); }

function connect_db($id): PDO {
    $s = pdo()->prepare('SELECT * FROM db_connections WHERE id=? AND user_id=?'); $s->execute([(int)$id, user_id()]);
    $r = $s->fetch(); if (!$r) throw new RuntimeException('Saved database connection not found.');
    check_host($r['host']);
    return new PDO("mysql:host={$r['host']};port={$r['port']};charset=utf8mb4", $r['username'], dec($r['password_enc']),
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => true, PDO::ATTR_TIMEOUT => 10]);
}

/** Build one column definition for CREATE/ALTER from the form data. */
function colDef(PDO $db, array $c): string {
    $type = strtoupper(trim($c['type'] ?? '')); if (!in_array($type, COL_TYPES, true)) throw new RuntimeException('Choose a valid column type.');
    $len = trim((string)($c['length'] ?? '')); $sql = qi(trim($c['name'] ?? '')) . ' ' . $type;
    if ($len !== '') {
        if (in_array($type, ['ENUM', 'SET'], true)) {
            $vals = array_map(fn($v) => $db->quote(trim($v, " '\"")), array_filter(array_map('trim', explode(',', $len)), fn($v) => $v !== ''));
            $sql .= '(' . implode(',', $vals) . ')';
        } elseif (preg_match('/^\d+(\s*,\s*\d+)?$/', $len)) $sql .= "($len)";
        else throw new RuntimeException('Length must be a number such as 255 or 10,2.');
    }
    if (!empty($c['unsigned']) && in_array($type, NUMERIC, true)) $sql .= ' UNSIGNED';
    $sql .= empty($c['null']) ? ' NOT NULL' : ' NULL';
    switch ($c['default_type'] ?? 'none') {
        case 'null': $sql .= ' DEFAULT NULL'; break;
        case 'current_timestamp': $sql .= ' DEFAULT CURRENT_TIMESTAMP'; break;
        case 'custom': $sql .= ' DEFAULT ' . $db->quote((string)($c['default'] ?? '')); break;
    }
    if (!empty($c['ai'])) $sql .= ' AUTO_INCREMENT';
    if (($c['comment'] ?? '') !== '') $sql .= ' COMMENT ' . $db->quote($c['comment']);
    return $sql;
}
function position(array $c): string {
    $a = $c['after'] ?? ''; if ($a === '' || $a === null) return '';
    return $a === '__first__' ? ' FIRST' : ' AFTER ' . qi($a);
}
function meta(PDO $db, string $d, string $t): array {
    $cols = $db->query('SHOW FULL COLUMNS FROM ' . qt($d, $t))->fetchAll();
    return ['cols' => $cols, 'pk' => array_column(array_filter($cols, fn($c) => $c['Key'] === 'PRI'), 'Field')];
}
function pkWhere(array $pkCols, array $pk, array &$params): string {
    if (!$pkCols) throw new RuntimeException('This table has no primary key, so rows cannot be edited safely. Add a primary key first.');
    $w = [];
    foreach ($pkCols as $c) {
        if (!array_key_exists($c, $pk)) throw new RuntimeException("Missing key value for $c");
        if ($pk[$c] === null) $w[] = qi($c) . ' IS NULL'; else { $w[] = qi($c) . ' = ?'; $params[] = $pk[$c]; }
    }
    return implode(' AND ', $w);
}

try {
    $db = connect_db($in['conn'] ?? 0);
    $d = (string)($in['db'] ?? ''); $t = (string)($in['table'] ?? '');
    switch ($action) {
        case 'databases':
            json_out(['ok' => true, 'items' => $db->query('SELECT SCHEMA_NAME AS name, DEFAULT_COLLATION_NAME AS collation FROM information_schema.SCHEMATA ORDER BY 1')->fetchAll()]);
        case 'collations':
            json_out(['ok' => true, 'items' => array_column($db->query('SHOW COLLATION')->fetchAll(), 'Collation')]);
        case 'create_db':
            $col = (string)($in['collation'] ?? ''); if ($col !== '' && !preg_match('/^[A-Za-z0-9_]+$/', $col)) throw new RuntimeException('Invalid collation');
            $cs = $col ? ' CHARACTER SET ' . explode('_', $col)[0] . ' COLLATE ' . $col : '';
            $db->exec('CREATE DATABASE ' . qi($d) . $cs); json_out(['ok' => true]);
        case 'drop_db':
            $db->exec('DROP DATABASE ' . qi($d)); json_out(['ok' => true]);
        case 'tables':
            $q = $db->prepare('SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_ROWS AS `rows`, ROUND((DATA_LENGTH+INDEX_LENGTH)/1024,1) AS kb, TABLE_TYPE AS type FROM information_schema.TABLES WHERE TABLE_SCHEMA=? ORDER BY 1');
            $q->execute([$d]); json_out(['ok' => true, 'items' => $q->fetchAll()]);
        case 'structure':
            json_out(['ok' => true, 'columns' => $db->query('SHOW FULL COLUMNS FROM ' . qt($d, $t))->fetchAll(), 'indexes' => $db->query('SHOW INDEX FROM ' . qt($d, $t))->fetchAll(),
                      'create' => $db->query('SHOW CREATE TABLE ' . qt($d, $t))->fetch()['Create Table'] ?? '']);
        case 'create_table':
            $cols = $in['columns'] ?? []; if (!$cols) throw new RuntimeException('Add at least one column.');
            $defs = []; $pks = [];
            foreach ($cols as $c) { $defs[] = colDef($db, $c); if (!empty($c['primary'])) $pks[] = qi($c['name']); }
            if ($pks) $defs[] = 'PRIMARY KEY (' . implode(',', $pks) . ')';
            $eng = $in['engine'] ?? 'InnoDB'; if (!in_array($eng, ['InnoDB', 'MyISAM', 'MEMORY'], true)) $eng = 'InnoDB';
            $db->exec('CREATE TABLE ' . qt($d, $t) . " (\n  " . implode(",\n  ", $defs) . "\n) ENGINE=$eng DEFAULT CHARSET=utf8mb4");
            json_out(['ok' => true]);
        case 'drop_table':     $db->exec('DROP TABLE ' . qt($d, $t)); json_out(['ok' => true]);
        case 'truncate_table': $db->exec('TRUNCATE TABLE ' . qt($d, $t)); json_out(['ok' => true]);
        case 'rename_table':   $db->exec('RENAME TABLE ' . qt($d, $t) . ' TO ' . qt($d, (string)$in['new_name'])); json_out(['ok' => true]);

        case 'add_column':
            $c = $in['column']; $sql = 'ALTER TABLE ' . qt($d, $t) . ' ADD COLUMN ' . colDef($db, $c) . position($c);
            if (!empty($c['primary'])) $sql .= ', ADD PRIMARY KEY (' . qi($c['name']) . ')';
            $db->exec($sql); json_out(['ok' => true]);
        case 'modify_column':
            $c = $in['column'];
            $sql = 'ALTER TABLE ' . qt($d, $t) . ' CHANGE COLUMN ' . qi((string)$in['old_name']) . ' ' . colDef($db, $c) . position($c);
            $db->exec($sql); json_out(['ok' => true]);
        case 'drop_column':
            $db->exec('ALTER TABLE ' . qt($d, $t) . ' DROP COLUMN ' . qi((string)$in['column'])); json_out(['ok' => true]);

        case 'add_index':
            $cols = array_map('qi', array_filter((array)($in['columns'] ?? []))); if (!$cols) throw new RuntimeException('Pick at least one column.');
            $kind = $in['kind'] ?? 'INDEX'; $nm = trim((string)($in['name'] ?? ''));
            $sql = match ($kind) {
                'PRIMARY' => 'ADD PRIMARY KEY (' . implode(',', $cols) . ')',
                'UNIQUE' => 'ADD UNIQUE ' . ($nm ? qi($nm) : '') . ' (' . implode(',', $cols) . ')',
                'FULLTEXT' => 'ADD FULLTEXT ' . ($nm ? qi($nm) : '') . ' (' . implode(',', $cols) . ')',
                default => 'ADD INDEX ' . ($nm ? qi($nm) : '') . ' (' . implode(',', $cols) . ')',
            };
            $db->exec('ALTER TABLE ' . qt($d, $t) . ' ' . $sql); json_out(['ok' => true]);
        case 'drop_index':
            $n = (string)$in['name']; $db->exec('ALTER TABLE ' . qt($d, $t) . ' ' . ($n === 'PRIMARY' ? 'DROP PRIMARY KEY' : 'DROP INDEX ' . qi($n))); json_out(['ok' => true]);

        case 'browse':
            $m = meta($db, $d, $t); $per = max(5, min(500, (int)($in['per'] ?? 50))); $page = max(1, (int)($in['page'] ?? 1));
            $fields = array_column($m['cols'], 'Field'); $where = ''; $params = [];
            if (($s = trim((string)($in['search'] ?? ''))) !== '') {
                $where = ' WHERE CONCAT_WS(\' \',' . implode(',', array_map(fn($f) => 'CAST(' . qi($f) . ' AS CHAR)', $fields)) . ') LIKE ?'; $params[] = "%$s%";
            }
            $order = ''; if (!empty($in['sort']) && in_array($in['sort'], $fields, true)) $order = ' ORDER BY ' . qi($in['sort']) . (($in['dir'] ?? '') === 'desc' ? ' DESC' : ' ASC');
            $cnt = $db->prepare('SELECT COUNT(*) c FROM ' . qt($d, $t) . $where); $cnt->execute($params);
            $q = $db->prepare('SELECT * FROM ' . qt($d, $t) . $where . $order . ' LIMIT ' . $per . ' OFFSET ' . (($page - 1) * $per)); $q->execute($params);
            $rows = $q->fetchAll();
            foreach ($rows as &$r) foreach ($r as $k => $v) if (is_string($v) && strlen($v) > 300) $r[$k] = substr($v, 0, 300) . '…';
            json_out(['ok' => true, 'rows' => $rows, 'total' => (int)$cnt->fetch()['c'], 'pk' => $m['pk'], 'columns' => $m['cols'], 'page' => $page, 'per' => $per]);
        case 'get_row':
            $m = meta($db, $d, $t); $p = []; $w = pkWhere($m['pk'], (array)$in['pk'], $p);
            $q = $db->prepare('SELECT * FROM ' . qt($d, $t) . " WHERE $w LIMIT 1"); $q->execute($p); json_out(['ok' => true, 'row' => $q->fetch()]);
        case 'insert_row':
            $vals = (array)($in['values'] ?? []); $nulls = (array)($in['nulls'] ?? []); $cols = []; $ph = []; $p = [];
            foreach ($vals as $k => $v) { $cols[] = qi($k); if (in_array($k, $nulls, true)) $ph[] = 'NULL'; else { $ph[] = '?'; $p[] = $v; } }
            $q = $db->prepare('INSERT INTO ' . qt($d, $t) . ($cols ? ' (' . implode(',', $cols) . ') VALUES (' . implode(',', $ph) . ')' : ' () VALUES ()')); $q->execute($p);
            json_out(['ok' => true, 'insert_id' => $db->lastInsertId()]);
        case 'update_row':
            $m = meta($db, $d, $t); $vals = (array)$in['values']; $nulls = (array)($in['nulls'] ?? []); $set = []; $p = [];
            foreach ($vals as $k => $v) { if (in_array($k, $nulls, true)) $set[] = qi($k) . ' = NULL'; else { $set[] = qi($k) . ' = ?'; $p[] = $v; } }
            if (!$set) throw new RuntimeException('Nothing to update.');
            $w = pkWhere($m['pk'], (array)$in['pk'], $p);
            $q = $db->prepare('UPDATE ' . qt($d, $t) . ' SET ' . implode(',', $set) . " WHERE $w LIMIT 1"); $q->execute($p); json_out(['ok' => true]);
        case 'delete_rows':
            $m = meta($db, $d, $t); $n = 0;
            foreach ((array)$in['pks'] as $pk) { $p = []; $w = pkWhere($m['pk'], (array)$pk, $p); $q = $db->prepare('DELETE FROM ' . qt($d, $t) . " WHERE $w LIMIT 1"); $q->execute($p); $n += $q->rowCount(); }
            json_out(['ok' => true, 'deleted' => $n]);

        case 'query':
            if ($d !== '') $db->exec('USE ' . qi($d));
            $sql = trim((string)($in['sql'] ?? '')); if ($sql === '') throw new RuntimeException('Type a SQL statement first.');
            $t0 = microtime(true); $sets = []; $st = $db->query($sql);
            do {
                if ($st->columnCount() > 0) {
                    $rows = $st->fetchAll(); $cols = [];
                    for ($i = 0; $i < $st->columnCount(); $i++) $cols[] = $st->getColumnMeta($i)['name'];
                    $sets[] = ['type' => 'rows', 'columns' => $cols, 'rows' => array_slice($rows, 0, 1000), 'truncated' => count($rows) > 1000, 'count' => count($rows)];
                } else $sets[] = ['type' => 'affected', 'affected' => $st->rowCount()];
            } while ($st->nextRowset() && count($sets) < 20);
            json_out(['ok' => true, 'sets' => $sets, 'ms' => round((microtime(true) - $t0) * 1000)]);

        case 'export':
            while (ob_get_level()) ob_end_clean();
            $tables = $t !== '' ? [$t] : array_column($db->query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_TYPE=\'BASE TABLE\' AND TABLE_SCHEMA=' . $db->quote($d))->fetchAll(), 'TABLE_NAME');
            header('Content-Type: application/sql; charset=utf-8'); header('Content-Disposition: attachment; filename="' . preg_replace('/[^\w\-]/', '_', $t ?: $d) . '.sql"');
            echo "-- Portside export of `$d`" . ($t ? ".`$t`" : '') . ' on ' . date('c') . "\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n\n";
            foreach ($tables as $tb) {
                echo 'DROP TABLE IF EXISTS ' . qi($tb) . ";\n" . $db->query('SHOW CREATE TABLE ' . qt($d, $tb))->fetch()['Create Table'] . ";\n\n";
                $st = $db->query('SELECT * FROM ' . qt($d, $tb), PDO::FETCH_ASSOC); $buf = [];
                $flush = function () use (&$buf, $tb) { if ($buf) { echo 'INSERT INTO ' . qi($tb) . " VALUES\n" . implode(",\n", $buf) . ";\n"; $buf = []; } };
                while ($r = $st->fetch()) { $buf[] = '(' . implode(',', array_map(fn($v) => $v === null ? 'NULL' : $db->quote((string)$v), $r)) . ')'; if (count($buf) >= 100) $flush(); }
                $flush(); echo "\n";
            }
            echo "SET FOREIGN_KEY_CHECKS=1;\n"; exit;
    }
    json_out(['ok' => false, 'error' => 'Unknown action'], 400);
} catch (Throwable $e) { json_out(['ok' => false, 'error' => $e->getMessage()], 400); }
