<?php
require __DIR__ . '/includes/bootstrap.php'; require __DIR__ . '/includes/layout.php';
require_login(); page_head('Databases', 'db'); ?>
<div class="dbwrap">
  <aside class="side">
    <div class="sec"><select id="connSel" aria-label="Database connection"></select>
      <div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm" id="manageConn">Connections</button><button class="btn sm" id="newDb" disabled>New database</button></div></div>
    <div class="tree" id="tree"><div class="empty">Add a MySQL connection to begin.</div></div>
  </aside>
  <section class="main">
    <div class="crumb" id="crumb">No database selected</div>
    <div class="dbtabs" id="dbtabs"></div>
    <div class="content" id="content"><div class="empty">Pick a database on the left. Create databases, tables and columns, edit rows, or run SQL.</div></div>
  </section>
</div>
<script src="assets/common.js"></script><script src="assets/db.js"></script>
</body></html>
