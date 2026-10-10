<?php
/* Remote file systems: FTP, FTPS (explicit TLS) via the ftp extension; SFTP via the ssh2 extension. */

function modeToStr(int $mode, bool $dir, bool $link = false): string {
    $s = $link ? 'l' : ($dir ? 'd' : '-');
    foreach ([[0400,'r'],[0200,'w'],[0100,'x'],[040,'r'],[020,'w'],[010,'x'],[04,'r'],[02,'w'],[01,'x']] as [$b,$c]) $s .= ($mode & $b) ? $c : '-';
    return $s;
}
function joinPath(string $dir, string $name): string { return rtrim($dir, '/') . '/' . ltrim($name, '/'); }

interface RemoteFS {
    public function listDir(string $path): array;   // [{name,type:file|dir|link,size,modified,perms}]
    public function mkdir(string $p): void;
    public function delete(string $p, bool $isDir): void;
    public function rename(string $a, string $b): void;
    public function chmod(string $p, int $mode): void;
    public function download(string $p): void;
    public function upload(string $local, string $remote): void;
    public function read(string $p, int $max): string;
    public function write(string $p, string $data): void;
    public function pwd(): string;
    public function close(): void;
}

class FtpFS implements RemoteFS {
    private $c;
    public function __construct(array $o) {
        if (!function_exists('ftp_connect')) throw new RuntimeException('The PHP ftp extension is not enabled.');
        $port = (int)($o['port'] ?: 21);
        $this->c = $o['protocol'] === 'ftps' ? @ftp_ssl_connect($o['host'], $port, 15) : @ftp_connect($o['host'], $port, 15);
        if (!$this->c) throw new RuntimeException("Could not connect to {$o['host']}:$port");
        if (!@ftp_login($this->c, $o['username'], $o['password'])) throw new RuntimeException('Login failed: check username and password.');
        ftp_pasv($this->c, (bool)($o['passive'] ?? true));
    }
    private function fromMlsd(array $m): array {
        $out = [];
        foreach ($m as $e) {
            $t = strtolower($e['type'] ?? '');
            if (in_array($t, ['cdir', 'pdir'], true) || $e['name'] === '.' || $e['name'] === '..') continue;
            $mode = isset($e['unix.mode']) ? octdec($e['unix.mode']) : null;
            $isDir = $t === 'dir'; $isLink = str_contains($t, 'slink');
            $out[] = ['name' => $e['name'], 'type' => $isDir ? 'dir' : ($isLink ? 'link' : 'file'), 'size' => (int)($e['size'] ?? 0),
                'modified' => isset($e['modify']) ? (strtotime(substr($e['modify'], 0, 14) . ' UTC') ?: 0) : 0,
                'perms' => $mode !== null ? modeToStr($mode, $isDir, $isLink) : ''];
        }
        return $out;
    }
    public function listDir(string $path): array {
        if (!@ftp_chdir($this->c, $path)) throw new RuntimeException("Cannot open directory $path");
        $out = [];
        $m = @ftp_mlsd($this->c, '.');
        if (is_array($m) && $m && isset(array_values($m)[0]['unix.mode'])) {
            return $this->fromMlsd($m);
        }
        $lines = @ftp_rawlist($this->c, '.');
        if (!$lines && is_array($m) && $m) return $this->fromMlsd($m);   // server has MLSD but no rawlist
        if ($lines === false) throw new RuntimeException("Cannot list $path");
        foreach ($lines as $l) {
            if (!preg_match('/^([\-ldrwxsStT]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\w{3}\s+\d{1,2}\s+[\d:]{4,5})\s+(.+)$/', $l, $m)) continue;
            $name = $m[4]; $type = $m[1][0] === 'd' ? 'dir' : ($m[1][0] === 'l' ? 'link' : 'file');
            if ($type === 'link' && str_contains($name, ' -> ')) $name = explode(' -> ', $name)[0];
            if ($name === '.' || $name === '..') continue;
            $out[] = ['name' => $name, 'type' => $type, 'size' => (int)$m[2], 'modified' => strtotime($m[3]) ?: 0, 'perms' => $m[1]];
        }
        return $out;
    }
    public function mkdir(string $p): void { if (@ftp_mkdir($this->c, $p) === false) throw new RuntimeException("Cannot create $p"); }
    public function delete(string $p, bool $isDir): void {
        if (!$isDir) { if (!@ftp_delete($this->c, $p)) throw new RuntimeException("Cannot delete $p"); return; }
        foreach ($this->listDir($p) as $e) $this->delete(joinPath($p, $e['name']), $e['type'] === 'dir');
        if (!@ftp_rmdir($this->c, $p)) throw new RuntimeException("Cannot remove folder $p");
    }
    public function rename(string $a, string $b): void { if (!@ftp_rename($this->c, $a, $b)) throw new RuntimeException('Rename failed'); }
    public function chmod(string $p, int $mode): void { if (@ftp_chmod($this->c, $mode, $p) === false) throw new RuntimeException('The server refused the permission change'); }
    public function download(string $p): void {
        $out = fopen('php://output', 'wb');
        if (!@ftp_fget($this->c, $out, $p, FTP_BINARY)) throw new RuntimeException("Cannot download $p");
    }
    public function upload(string $local, string $remote): void { if (!@ftp_put($this->c, $remote, $local, FTP_BINARY)) throw new RuntimeException("Upload failed for $remote"); }
    public function read(string $p, int $max): string {
        $size = @ftp_size($this->c, $p); if ($size > $max) throw new RuntimeException('File is too large to edit here. Download it instead.');
        $t = fopen('php://temp', 'w+b'); if (!@ftp_fget($this->c, $t, $p, FTP_BINARY)) throw new RuntimeException("Cannot read $p");
        rewind($t); return stream_get_contents($t);
    }
    public function write(string $p, string $data): void {
        $t = fopen('php://temp', 'w+b'); fwrite($t, $data); rewind($t);
        if (!@ftp_fput($this->c, $p, $t, FTP_BINARY)) throw new RuntimeException("Cannot save $p");
    }
    public function pwd(): string { return @ftp_pwd($this->c) ?: '/'; }
    public function close(): void { if ($this->c) @ftp_close($this->c); }
}

class SftpFS implements RemoteFS {
    private $ssh, $sftp;
    public function __construct(array $o) {
        if (!function_exists('ssh2_connect')) throw new RuntimeException('SFTP needs the PHP ssh2 extension, which is not enabled on this server. Use FTP or FTPS instead.');
        $port = (int)($o['port'] ?: 22);
        $this->ssh = @ssh2_connect($o['host'], $port);
        if (!$this->ssh) throw new RuntimeException("Could not connect to {$o['host']}:$port");
        if (!@ssh2_auth_password($this->ssh, $o['username'], $o['password'])) throw new RuntimeException('Login failed: check username and password.');
        $this->sftp = ssh2_sftp($this->ssh);
    }
    private function u(string $p): string { return 'ssh2.sftp://' . intval($this->sftp) . $p; }
    public function listDir(string $path): array {
        $d = @opendir($this->u($path)); if (!$d) throw new RuntimeException("Cannot open directory $path");
        $out = [];
        while (($n = readdir($d)) !== false) {
            if ($n === '.' || $n === '..') continue;
            $st = @ssh2_sftp_stat($this->sftp, joinPath($path, $n)) ?: ['mode' => 0, 'size' => 0, 'mtime' => 0];
            $isDir = ($st['mode'] & 0170000) === 0040000; $isLink = ($st['mode'] & 0170000) === 0120000;
            $out[] = ['name' => $n, 'type' => $isDir ? 'dir' : ($isLink ? 'link' : 'file'), 'size' => (int)$st['size'], 'modified' => (int)$st['mtime'],
                'perms' => modeToStr($st['mode'] & 0777, $isDir, $isLink)];
        }
        closedir($d); return $out;
    }
    public function mkdir(string $p): void { if (!@ssh2_sftp_mkdir($this->sftp, $p, 0755)) throw new RuntimeException("Cannot create $p"); }
    public function delete(string $p, bool $isDir): void {
        if (!$isDir) { if (!@ssh2_sftp_unlink($this->sftp, $p)) throw new RuntimeException("Cannot delete $p"); return; }
        foreach ($this->listDir($p) as $e) $this->delete(joinPath($p, $e['name']), $e['type'] === 'dir');
        if (!@ssh2_sftp_rmdir($this->sftp, $p)) throw new RuntimeException("Cannot remove folder $p");
    }
    public function rename(string $a, string $b): void { if (!@ssh2_sftp_rename($this->sftp, $a, $b)) throw new RuntimeException('Rename failed'); }
    public function chmod(string $p, int $mode): void { if (!@ssh2_sftp_chmod($this->sftp, $p, $mode)) throw new RuntimeException('The server refused the permission change'); }
    public function download(string $p): void {
        $in = @fopen($this->u($p), 'rb'); if (!$in) throw new RuntimeException("Cannot download $p");
        while (!feof($in)) { echo fread($in, 65536); flush(); } fclose($in);
    }
    public function upload(string $local, string $remote): void {
        $out = @fopen($this->u($remote), 'wb'); if (!$out) throw new RuntimeException("Upload failed for $remote");
        $in = fopen($local, 'rb'); stream_copy_to_stream($in, $out); fclose($in); fclose($out);
    }
    public function read(string $p, int $max): string {
        $st = @ssh2_sftp_stat($this->sftp, $p); if ($st && $st['size'] > $max) throw new RuntimeException('File is too large to edit here. Download it instead.');
        $d = @file_get_contents($this->u($p)); if ($d === false) throw new RuntimeException("Cannot read $p"); return $d;
    }
    public function write(string $p, string $data): void { if (@file_put_contents($this->u($p), $data) === false) throw new RuntimeException("Cannot save $p"); }
    public function pwd(): string { return @ssh2_sftp_realpath($this->sftp, '.') ?: '/'; }
    public function close(): void {}
}

function open_remote(array $c): RemoteFS {
    check_host($c['host']);
    return $c['protocol'] === 'sftp' ? new SftpFS($c) : new FtpFS($c);
}

/** Resolve the connection a request refers to: a saved site id, or the session-only "quick" connection. */
function resolve_connection($id): array {
    if ($id === 'quick') {
        if (empty($_SESSION['quick'])) throw new RuntimeException('Quick connection expired. Connect again.');
        return json_decode(dec($_SESSION['quick']), true);
    }
    $s = pdo()->prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?'); $s->execute([(int)$id, user_id()]);
    $r = $s->fetch(); if (!$r) throw new RuntimeException('Saved site not found');
    $r['password'] = dec($r['password_enc']); return $r;
}
