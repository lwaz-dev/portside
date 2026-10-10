<?php
require __DIR__ . '/includes/bootstrap.php'; require __DIR__ . '/includes/layout.php';
require_login(); page_head('File transfer', 'files'); ?>
<form class="connbar" id="quick" autocomplete="off">
  <button type="button" class="btn" id="siteMgr">Site manager</button>
  <label>Host <input name="host" placeholder="ftp.example.com"></label>
  <label>Username <input name="username"></label>
  <label>Password <input name="password" type="password"></label>
  <label>Port <input name="port" class="sm" placeholder="auto"></label>
  <label>Protocol <select name="protocol"><option value="ftp">FTP</option><option value="ftps">FTPS (explicit TLS)</option><option value="sftp">SFTP (SSH)</option></select></label>
  <button class="btn primary">Quick connect</button>
</form>
<div class="tabs" id="sessionTabs"></div>
<div class="panes">
  <section class="pane" id="localPane" aria-label="Local files">
    <div class="pane-h"><h2>Local files</h2>
      <button class="btn sm" id="addFiles">Add files</button><button class="btn sm" id="addFolder">Add folder</button>
      <input type="file" id="fileIn" multiple hidden><input type="file" id="dirIn" webkitdirectory hidden>
    </div>
    <div class="list" id="stage"><div class="empty">Browsers cannot read your disk directly.<br>Add files or a folder here, or drop them on the remote side to upload.</div></div>
    <div class="pane-h"><button class="btn sm primary" id="uploadAll" disabled>Upload to remote folder</button><button class="btn sm" id="clearStage" disabled>Clear</button></div>
  </section>
  <section class="pane" id="remotePane" aria-label="Remote files">
    <div class="pane-h"><h2 id="remoteTitle">Remote site</h2>
      <button class="btn sm" data-act="up" title="Parent folder (Backspace)">Up</button>
      <button class="btn sm" data-act="refresh">Refresh</button>
      <input class="path" id="pathIn" aria-label="Remote path" spellcheck="false">
      <button class="btn sm" data-act="mkdir">New folder</button>
      <button class="btn sm" data-act="newfile">New file</button>
    </div>
    <div class="pane-h" id="selBar">
      <button class="btn sm" data-act="download">Download</button><button class="btn sm" data-act="edit">Edit</button>
      <button class="btn sm" data-act="rename">Rename</button><button class="btn sm" data-act="chmod">Permissions</button>
      <button class="btn sm danger" data-act="delete">Delete</button>
    </div>
    <div class="list" id="remoteList" tabindex="0"></div>
    <div class="status" id="remoteStatus">Not connected</div>
  </section>
</div>
<div class="bottom">
  <div class="tabs"><div class="tab on" data-b="queue">Transfer queue</div><div class="tab" data-b="log">Message log</div></div>
  <div class="bpane" id="queue"></div><div class="bpane log" id="log" hidden></div>
</div>
<script src="assets/common.js"></script><script src="assets/app.js"></script>
</body></html>
