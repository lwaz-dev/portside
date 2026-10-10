# Portside: web FTP/FTPS/SFTP client + MySQL manager

A FileZilla-style file transfer client and a phpMyAdmin-style database editor in one PHP/MySQL app.
Users create an account, save their FTP sites and MySQL connections (passwords are AES-256-GCM encrypted), then manage files and databases from the browser.

## Install on XAMPP
1. Copy this folder to `C:\xampp\htdocs\portside`.
2. In `config.php` set a long random `app_key` (do this before creating accounts).
3. Start Apache and MySQL, then open `http://localhost/portside/install.php` (it creates the `portside` database and tables).
4. Open `register.php`, create your account, and delete `install.php`.

## Deploy on cPanel
1. Create a database and user in **MySQL Databases**; put the prefixed names in `config.php` (`cpuser_portside`, `cpuser_user`).
2. Upload the folder to `public_html/portside`, open `install.php` once, then delete it.
3. Set `allow_private_hosts` to `false` on any public server.
4. Make sure PHP has the `ftp`, `openssl`, `pdo_mysql` extensions (MultiPHP INI Editor / Select PHP Version). SFTP also needs `ssh2`.

## What it does
**File transfer:** Site manager (save, edit, delete sites), quick connect, FTP / FTPS (explicit TLS) / SFTP, multiple connection tabs, remote browser with sorting and multi-select, drag-and-drop upload (including folders) with a transfer queue, progress and retry, download, rename, delete (recursive), new folder and file, permissions (chmod) dialog, built-in text editor, right-click menu, keyboard shortcuts (Del, F2, F5, Backspace, Enter, Ctrl+A), message log.

**Databases:** Saved MySQL connections; create and drop databases; create, rename, empty and drop tables; add, change and drop columns (type, length, unsigned, null, default, auto-increment, position, comment); add and drop indexes (primary, unique, index, fulltext); browse with search, sort and paging; insert, edit and delete rows; run SQL (multi-statement); export a table or whole database as .sql.

## Limits to know
- Browsers cannot read your local disk, so the "Local files" pane is an upload staging area rather than a real local tree.
- PHP's `upload_max_filesize` and `post_max_size` cap each upload (raise them in php.ini or cPanel's PHP options).
- Folders can't be downloaded as one unit yet; select the files inside.
- Remote MySQL on cPanel must allow your server's IP under **Remote MySQL**.
- Changing `app_key` after saving connections makes the stored passwords unreadable.
