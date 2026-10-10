/* Portside database manager */
const API = 'api/db.php';
const D = { conn: null, conns: [], dbs: [], tables: {}, open: new Set(), db: '', table: '', tab: 'browse', br: { page: 1, per: 50, sort: '', dir: 'asc', search: '' }, rows: [], meta: null, collations: [] };
const call = (action, extra = {}) => api(API, { action, conn: D.conn, db: D.db, table: D.table, ...extra });
const TYPES = ['INT', 'BIGINT', 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'DECIMAL', 'FLOAT', 'DOUBLE', 'BIT', 'BOOLEAN', 'VARCHAR', 'CHAR', 'TEXT', 'TINYTEXT', 'MEDIUMTEXT', 'LONGTEXT', 'DATE', 'DATETIME', 'TIMESTAMP', 'TIME', 'YEAR', 'ENUM', 'SET', 'JSON', 'BINARY', 'VARBINARY', 'BLOB', 'TINYBLOB', 'MEDIUMBLOB', 'LONGBLOB'];
const opt = (list, sel) => list.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
const fail = e => toast(e.message, true);

/* ---------- connections ---------- */
async function loadConns(select) {
  D.conns = (await api('api/sites.php', { action: 'list' })).db;
  const s = $('#connSel'); s.innerHTML = D.conns.length ? D.conns.map(c => `<option value="${c.id}">${esc(c.name)} (${esc(c.host)})</option>`).join('') : '<option value="">No connections</option>';
  if (select) s.value = select;
  if (D.conns.length) connect(s.value); else { D.conn = null; $('#tree').innerHTML = '<div class="empty">Add a MySQL connection to begin.</div>'; $('#newDb').disabled = true; }
}
async function connect(id) {
  D.conn = id; D.db = D.table = ''; D.tables = {}; D.open.clear(); $('#newDb').disabled = false; crumb(); $('#dbtabs').innerHTML = '';
  $('#content').innerHTML = '<div class="empty">Pick a database on the left.</div>';
  try { D.dbs = (await call('databases')).items; drawTree(); const c = D.conns.find(c => c.id == id); if (c && c.default_db && D.dbs.some(d => d.name === c.default_db)) openDb(c.default_db); } catch (e) { fail(e); $('#tree').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
$('#connSel').onchange = e => connect(e.target.value);
$('#manageConn').onclick = () => {
  let cur = null;
  const m = modal({ title: 'Database connections', wide: true, body: '<div class="sites"><div><ul id="cl"></ul><button class="btn sm" id="nc" style="margin-top:8px">New connection</button></div><div id="cf"></div></div>', buttons: [
    { label: 'Close' }, { label: 'Delete', danger: true, onclick: async () => { if (cur && cur.id && await confirmBox('Delete connection', `Delete "${cur.name}"? Your databases are not affected.`, 'Delete', true)) { await api('api/sites.php', { action: 'delete_db', id: cur.id }); cur = null; await loadConns(); draw(); } } },
    { label: 'Save and connect', primary: true, onclick: async (el, close) => {
      const d = { action: 'save_db', id: cur.id || '' }; $$('#cf [name]', el).forEach(i => d[i.name] = i.value);
      try { const r = await api('api/sites.php', d); close(); toast('Connection saved'); await loadConns(String(r.id)); } catch (e) { fail(e); } } }] });
  const list = $('#cl', m.el), form = $('#cf', m.el);
  function draw() {
    list.innerHTML = D.conns.map(c => `<li data-id="${c.id}" class="${cur && cur.id == c.id ? 'on' : ''}">${esc(c.name)}<small>${esc(c.username)}@${esc(c.host)}</small></li>`).join('') || '<li style="cursor:default;color:var(--muted)">No connections yet</li>';
    form.innerHTML = !cur ? '<div class="empty">Select a connection, or choose New connection.</div>' : `<div class="grid2">
      <label class="span2">Name<input name="name" value="${esc(cur.name)}"></label>
      <label>Host<input name="host" value="${esc(cur.host)}"></label><label>Port<input name="port" value="${esc(cur.port)}"></label>
      <label>Username<input name="username" value="${esc(cur.username)}" autocomplete="off"></label>
      <label>Password<input name="password" type="password" placeholder="${cur.id ? 'Leave blank to keep saved password' : ''}" autocomplete="new-password"></label>
      <label class="span2">Default database (optional)<input name="default_db" value="${esc(cur.default_db)}"></label></div>
      <p style="color:var(--muted)">Remote hosts must allow connections from this server (cPanel: Remote MySQL).</p>`;
  }
  list.onclick = e => { const li = e.target.closest('li[data-id]'); if (li) { cur = { ...D.conns.find(c => c.id == li.dataset.id) }; draw(); } };
  $('#nc', m.el).onclick = () => { cur = { name: 'Local MySQL', host: 'localhost', port: 3306, username: 'root', default_db: '' }; draw(); };
  draw();
};

/* ---------- tree ---------- */
function drawTree() {
  $('#tree').innerHTML = D.dbs.map(d => `<div class="db" data-db="${esc(d.name)}"><span>${D.open.has(d.name) ? '▾' : '▸'} ${esc(d.name)}</span></div>` +
    (D.open.has(d.name) ? (D.tables[d.name] || []).map(t => `<div class="tb ${D.db === d.name && D.table === t.name ? 'on' : ''}" data-db="${esc(d.name)}" data-t="${esc(t.name)}"><span>${esc(t.name)}</span><small>${t.rows ?? ''}</small></div>`).join('') : '')).join('');
}
$('#tree').onclick = e => {
  const tb = e.target.closest('.tb'); if (tb) return openTable(tb.dataset.db, tb.dataset.t, 'browse');
  const db = e.target.closest('.db'); if (db) { const n = db.dataset.db; if (D.open.has(n) && D.db === n && !D.table) { D.open.delete(n); drawTree(); } else openDb(n); }
};
async function openDb(name) {
  D.db = name; D.table = ''; D.open.add(name);
  try { D.tables[name] = (await call('tables')).items; } catch (e) { return fail(e); }
  drawTree(); crumb(); tabs([['overview', 'Tables'], ['sql', 'SQL']], 'overview'); D.tab = 'overview'; render();
}
function openTable(db, t, tab) { D.db = db; D.table = t; D.tab = tab || 'browse'; D.br = { page: 1, per: 50, sort: '', dir: 'asc', search: '' }; drawTree(); crumb(); tabs([['browse', 'Browse'], ['structure', 'Structure'], ['insert', 'Insert row'], ['sql', 'SQL'], ['ops', 'Operations'], ['export', 'Export']], D.tab); render(); }
function crumb() { $('#crumb').innerHTML = D.db ? `${esc(D.db)}${D.table ? ' <span>/</span> ' + esc(D.table) : ''}` : 'No database selected'; }
function tabs(list, on) { $('#dbtabs').innerHTML = list.map(([k, l]) => `<div class="tab ${k === on ? 'on' : ''}" data-k="${k}">${l}</div>`).join(''); }
$('#dbtabs').onclick = e => { const t = e.target.closest('.tab'); if (!t) return; D.tab = t.dataset.k; $$('#dbtabs .tab').forEach(x => x.classList.toggle('on', x === t)); render(); };
async function refreshTables() { D.tables[D.db] = (await call('tables')).items; drawTree(); }
function render() {
  ({ overview, browse, structure, insert: () => rowForm(null), sql, ops, export: exportTab }[D.tab] || overview)();
}

/* ---------- new database ---------- */
$('#newDb').onclick = async () => {
  if (!D.collations.length) try { D.collations = (await call('collations')).items; } catch (e) {}
  modal({ title: 'Create database', body: `<div class="stack"><label>Database name<input id="n"></label><label style="margin-top:10px">Collation<select id="c"><option value="">Server default</option>${opt(D.collations, 'utf8mb4_unicode_ci')}</select></label></div>`, buttons: [{ label: 'Cancel' },
    { label: 'Create', primary: true, onclick: async (el, close) => { try { const n = $('#n', el).value.trim(); await call('create_db', { db: n, collation: $('#c', el).value }); close(); D.dbs = (await call('databases')).items; toast('Database created'); openDb(n); } catch (e) { fail(e); } } }] });
};

/* ---------- overview ---------- */
function overview() {
  const ts = D.tables[D.db] || [];
  $('#content').innerHTML = `<div class="tools"><button class="btn primary" id="ct">Create table</button><button class="btn" id="ex">Export database</button><button class="btn danger" id="dd">Drop database</button></div>` +
    (ts.length ? `<table class="data"><tr><th>Table</th><th>Rows (approx.)</th><th>Engine</th><th>Size</th><th>Actions</th></tr>${ts.map(t => `<tr><td>${esc(t.name)}${t.type === 'VIEW' ? '<span class="tag">view</span>' : ''}</td><td>${t.rows ?? ''}</td><td>${esc(t.engine ?? '')}</td><td>${t.kb} KB</td>
      <td class="act"><a data-b="${esc(t.name)}">Browse</a><a data-s="${esc(t.name)}">Structure</a></td></tr>`).join('')}</table>` : '<div class="empty">This database has no tables yet. Create the first one.</div>');
  $('#ct').onclick = createTable; $('#ex').onclick = () => location.href = `${API}?action=export&conn=${D.conn}&db=${encodeURIComponent(D.db)}&_csrf=${CSRF}`;
  $('#dd').onclick = async () => { if (await confirmBox('Drop database', `Permanently delete database "${D.db}" and all its tables?`, 'Drop database', true)) try { await call('drop_db'); D.dbs = (await call('databases')).items; D.db = ''; D.open.clear(); drawTree(); crumb(); $('#dbtabs').innerHTML = ''; $('#content').innerHTML = '<div class="empty">Database dropped.</div>'; } catch (e) { fail(e); } };
  $$('#content [data-b]').forEach(a => a.onclick = () => openTable(D.db, a.dataset.b, 'browse')); $$('#content [data-s]').forEach(a => a.onclick = () => openTable(D.db, a.dataset.s, 'structure'));
}

/* ---------- create table ---------- */
function createTable() {
  const row = (n = '', t = 'VARCHAR', l = '255') => `<tr><td><input class="n" value="${esc(n)}" style="width:130px"></td><td><select class="t">${opt(TYPES, t)}</select></td><td><input class="l" value="${esc(l)}" style="width:64px"></td>
    <td><input class="d" style="width:110px" placeholder="none"></td><td><input type="checkbox" class="nl"></td><td><input type="checkbox" class="ai"></td><td><input type="checkbox" class="pk"></td><td><a class="x" style="cursor:pointer">remove</a></td></tr>`;
  const m = modal({ title: 'Create table in ' + D.db, wide: true, body: `<div class="grid2" style="margin-bottom:10px"><label>Table name<input id="tn"></label><label>Engine<select id="en">${opt(['InnoDB', 'MyISAM', 'MEMORY'], 'InnoDB')}</select></label></div>
    <table class="data" id="cols"><tr><th>Name</th><th>Type</th><th>Length</th><th>Default</th><th>Null</th><th>Auto-inc.</th><th>Primary</th><th></th></tr>${row('id', 'INT', '')}${row('', 'VARCHAR', '255')}</table>
    <p style="color:var(--muted)">Default: leave blank for none, or type NULL, CURRENT_TIMESTAMP, or a value.</p><button class="btn sm" id="ac">Add column</button>`, buttons: [{ label: 'Cancel' },
    { label: 'Create table', primary: true, onclick: async (el, close) => {
      const columns = $$('#cols tr', el).slice(1).map(r => { const d = $('.d', r).value; return { name: $('.n', r).value.trim(), type: $('.t', r).value, length: $('.l', r).value, null: $('.nl', r).checked, ai: $('.ai', r).checked, primary: $('.pk', r).checked,
        default_type: d === '' ? 'none' : d.toUpperCase() === 'NULL' ? 'null' : d.toUpperCase() === 'CURRENT_TIMESTAMP' ? 'current_timestamp' : 'custom', default: d }; }).filter(c => c.name);
      try { const n = $('#tn', el).value.trim(); await call('create_table', { table: n, columns, engine: $('#en', el).value }); close(); await refreshTables(); toast('Table created'); openTable(D.db, n, 'structure'); } catch (e) { fail(e); } } }] });
  const first = $$('#cols tr', m.el)[1]; $('.ai', first).checked = $('.pk', first).checked = true;
  $('#ac', m.el).onclick = () => $('#cols', m.el).insertAdjacentHTML('beforeend', row());
  m.el.addEventListener('click', e => { if (e.target.classList.contains('x')) e.target.closest('tr').remove(); });
}

/* ---------- structure ---------- */
async function structure() {
  let r; try { r = await call('structure'); } catch (e) { return $('#content').innerHTML = `<div class="msg e">${esc(e.message)}</div>`; }
  D.cols = r.columns; const idx = {}; r.indexes.forEach(i => (idx[i.Key_name] = idx[i.Key_name] || { name: i.Key_name, unique: !+i.Non_unique, cols: [], type: i.Index_type }).cols.push(i.Column_name));
  $('#content').innerHTML = `<div class="tools"><button class="btn primary" id="ac">Add column</button></div>
  <table class="data"><tr><th>#</th><th>Column</th><th>Type</th><th>Null</th><th>Key</th><th>Default</th><th>Extra</th><th>Comment</th><th>Actions</th></tr>${r.columns.map((c, i) => `<tr><td>${i + 1}</td><td><b>${esc(c.Field)}</b></td><td>${esc(c.Type)}</td><td>${c.Null}</td><td>${esc(c.Key)}</td>
    <td class="${c.Default === null ? 'null' : ''}">${c.Default === null ? 'NULL' : esc(c.Default)}</td><td>${esc(c.Extra)}</td><td>${esc(c.Comment)}</td><td class="act"><a data-e="${i}">Change</a><a data-d="${i}" style="color:var(--flag)">Drop</a></td></tr>`).join('')}</table>
  <h3 style="margin:22px 0 8px">Indexes</h3><div class="tools"><button class="btn sm" id="ai">Add index</button></div>
  <table class="data"><tr><th>Name</th><th>Type</th><th>Columns</th><th></th></tr>${Object.values(idx).map(x => `<tr><td>${esc(x.name)}</td><td>${x.name === 'PRIMARY' ? 'Primary' : x.type === 'FULLTEXT' ? 'Fulltext' : x.unique ? 'Unique' : 'Index'}</td><td>${esc(x.cols.join(', '))}</td><td class="act"><a data-di="${esc(x.name)}" style="color:var(--flag)">Drop</a></td></tr>`).join('') || '<tr><td colspan="4" class="null">No indexes</td></tr>'}</table>
  <h3 style="margin:22px 0 8px">CREATE statement</h3><pre class="mono" style="background:var(--harbor);padding:10px;overflow:auto;border-radius:4px">${esc(r.create)}</pre>`;
  $('#ac').onclick = () => columnForm(null);
  $$('#content [data-e]').forEach(a => a.onclick = () => columnForm(r.columns[a.dataset.e]));
  $$('#content [data-d]').forEach(a => a.onclick = async () => { const c = r.columns[a.dataset.d]; if (await confirmBox('Drop column', `Drop column "${c.Field}"? Its data is lost.`, 'Drop column', true)) try { await call('drop_column', { column: c.Field }); toast('Column dropped'); structure(); } catch (e) { fail(e); } });
  $$('#content [data-di]').forEach(a => a.onclick = async () => { if (await confirmBox('Drop index', `Drop index "${a.dataset.di}"?`, 'Drop index', true)) try { await call('drop_index', { name: a.dataset.di }); structure(); } catch (e) { fail(e); } });
  $('#ai').onclick = () => modal({ title: 'Add index', body: `<div class="stack"><label>Type<select id="k"><option>INDEX</option><option>UNIQUE</option><option>PRIMARY</option><option>FULLTEXT</option></select></label>
    <label style="margin-top:10px">Name (optional)<input id="n"></label><p>Columns (hold Ctrl/Cmd to pick several)</p><select id="c" multiple size="6" style="width:100%">${r.columns.map(c => `<option>${esc(c.Field)}</option>`).join('')}</select></div>`, buttons: [{ label: 'Cancel' },
    { label: 'Add index', primary: true, onclick: async (el, close) => { try { await call('add_index', { kind: $('#k', el).value, name: $('#n', el).value, columns: [...$('#c', el).selectedOptions].map(o => o.value) }); close(); structure(); } catch (e) { fail(e); } } }] });
}
function columnForm(c) {
  const edit = !!c, tm = edit ? /^(\w+)(?:\((.*?)\))?(\s+unsigned)?/i.exec(c.Type) : null, others = (D.cols || []).map(x => x.Field);
  const dt = !edit ? 'none' : c.Default === null ? (c.Null === 'YES' ? 'null' : 'none') : /current_timestamp/i.test(c.Default) ? 'current_timestamp' : 'custom';
  const after = edit ? (others.indexOf(c.Field) > 0 ? others[others.indexOf(c.Field) - 1] : '__first__') : (others[others.length - 1] || '');
  modal({ title: edit ? 'Change column ' + c.Field : 'Add column to ' + D.table, wide: true, body: `<div class="grid2">
    <label>Name<input id="name" value="${esc(c?.Field || '')}"></label>
    <label>Type<select id="type">${opt(TYPES, edit ? tm[1].toUpperCase() : 'VARCHAR')}</select></label>
    <label>Length / values (ENUM: a,b,c)<input id="length" value="${esc(tm?.[2] || (edit ? '' : '255'))}"></label>
    <label>Default<select id="dt"><option value="none">None</option><option value="null">NULL</option><option value="current_timestamp">CURRENT_TIMESTAMP</option><option value="custom">As defined:</option></select></label>
    <label>Default value<input id="def" value="${esc(dt === 'custom' ? c.Default : '')}"></label>
    <label>Position<select id="after"><option value="__first__" ${after === '__first__' ? 'selected' : ''}>First</option>${others.filter(o => o !== c?.Field).map(o => `<option value="${esc(o)}" ${o === after ? 'selected' : ''}>After ${esc(o)}</option>`).join('')}</select></label>
    <label class="span2">Comment<input id="comment" value="${esc(c?.Comment || '')}"></label>
    <div class="span2" style="display:flex;gap:18px;flex-wrap:wrap"><label><input type="checkbox" id="null" style="display:inline;width:auto" ${edit && c.Null === 'YES' ? 'checked' : ''}> Allow NULL</label>
    <label><input type="checkbox" id="unsigned" style="display:inline;width:auto" ${tm?.[3] ? 'checked' : ''}> Unsigned</label>
    <label><input type="checkbox" id="ai" style="display:inline;width:auto" ${edit && /auto_increment/.test(c.Extra) ? 'checked' : ''}> Auto-increment</label>
    ${edit ? '' : '<label><input type="checkbox" id="primary" style="display:inline;width:auto"> Primary key</label>'}</div></div>`, buttons: [{ label: 'Cancel' },
    { label: edit ? 'Save column' : 'Add column', primary: true, onclick: async (el, close) => {
      const v = id => $('#' + id, el), col = { name: v('name').value.trim(), type: v('type').value, length: v('length').value, default_type: v('dt').value, default: v('def').value, after: v('after').value, comment: v('comment').value, null: v('null').checked, unsigned: v('unsigned').checked, ai: v('ai').checked, primary: v('primary')?.checked };
      try { await call(edit ? 'modify_column' : 'add_column', { column: col, old_name: c?.Field }); close(); toast(edit ? 'Column updated' : 'Column added'); structure(); } catch (e) { fail(e); } } }],
    onopen: el => { $('#dt', el).value = dt; } });
}

/* ---------- browse + row editing ---------- */
async function browse() {
  const b = D.br; let r;
  try { r = await call('browse', b); } catch (e) { return $('#content').innerHTML = `<div class="msg e">${esc(e.message)}</div>`; }
  D.rows = r.rows; D.meta = r; const pages = Math.max(1, Math.ceil(r.total / r.per)), names = r.columns.map(c => c.Field), editable = r.pk.length > 0;
  $('#content').innerHTML = `${editable ? '' : '<div class="msg">This table has no primary key, so rows are read-only. Add a primary key in Structure to edit rows.</div>'}
  <div class="tools"><input id="q" placeholder="Search all columns" value="${esc(b.search)}"><button class="btn" id="go">Search</button><button class="btn primary" id="ins">Insert row</button><button class="btn danger" id="del" ${editable ? '' : 'disabled'}>Delete selected</button>
  <span style="margin-left:auto">${r.total} rows · page ${r.page} of ${pages}</span><button class="btn sm" id="pv" ${r.page <= 1 ? 'disabled' : ''}>Prev</button><button class="btn sm" id="nx" ${r.page >= pages ? 'disabled' : ''}>Next</button>
  <select id="per">${[25, 50, 100, 250, 500].map(n => `<option ${n === r.per ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
  <div style="overflow:auto"><table class="data"><tr><th><input type="checkbox" id="all"></th><th></th>${names.map(n => `<th data-sort="${esc(n)}" style="cursor:pointer">${esc(n)}${b.sort === n ? (b.dir === 'asc' ? ' ▲' : ' ▼') : ''}${r.pk.includes(n) ? '<span class="tag">pk</span>' : ''}</th>`).join('')}</tr>
  ${r.rows.map((row, i) => `<tr><td><input type="checkbox" class="rs" data-i="${i}" ${editable ? '' : 'disabled'}></td><td class="act">${editable ? `<a data-ed="${i}">Edit</a>` : ''}</td>${names.map(n => row[n] === null ? '<td class="null">NULL</td>' : `<td title="${esc(row[n])}">${esc(row[n])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${names.length + 2}" class="null">No rows</td></tr>`}</table></div>`;
  const go = () => { b.search = $('#q').value; b.page = 1; browse(); };
  $('#go').onclick = go; $('#q').onkeydown = e => e.key === 'Enter' && go();
  $('#pv').onclick = () => { b.page--; browse(); }; $('#nx').onclick = () => { b.page++; browse(); }; $('#per').onchange = e => { b.per = +e.target.value; b.page = 1; browse(); };
  $('#ins').onclick = () => rowForm(null, true); $('#all').onchange = e => $$('.rs:not(:disabled)').forEach(x => x.checked = e.target.checked);
  $$('[data-sort]').forEach(th => th.onclick = () => { b.dir = b.sort === th.dataset.sort && b.dir === 'asc' ? 'desc' : 'asc'; b.sort = th.dataset.sort; browse(); });
  $$('[data-ed]').forEach(a => a.onclick = () => rowForm(pkOf(r.rows[a.dataset.ed]), true));
  $('#del').onclick = async () => { const sel = $$('.rs:checked').map(x => pkOf(r.rows[x.dataset.i])); if (!sel.length) return toast('Select rows first.', true);
    if (await confirmBox('Delete rows', `Delete ${sel.length} row(s)? This cannot be undone.`, 'Delete', true)) try { await call('delete_rows', { pks: sel }); toast('Rows deleted'); browse(); } catch (e) { fail(e); } };
}
const pkOf = row => Object.fromEntries(D.meta.pk.map(k => [k, row[k]]));
async function rowForm(pk, fromBrowse) {
  let cols, row = null;
  try { cols = D.meta && D.meta.columns && D.meta.columns.length && D.tab !== 'insert' ? D.meta.columns : (await call('structure')).columns; if (pk) row = (await call('get_row', { pk })).row; } catch (e) { return fail(e); }
  const long = /text|blob|json/i, html = cols.map(c => {
    const auto = /auto_increment/.test(c.Extra) || c.Default !== null || /DEFAULT_GENERATED/.test(c.Extra), val = row ? row[c.Field] : null, isNull = row ? val === null : false;
    return `<div class="span2" data-f="${esc(c.Field)}"><label>${esc(c.Field)} <span class="tag">${esc(c.Type)}</span>
      ${long.test(c.Type) ? `<textarea rows="3" style="width:100%" ${(!row && auto) ? 'disabled' : ''}>${esc(val ?? '')}</textarea>` : `<input style="width:100%" value="${esc(val ?? '')}" ${(!row && auto) ? 'disabled' : ''}>`}</label>
      <label style="display:inline-flex;gap:5px;margin-right:14px"><input type="checkbox" class="isnull" ${isNull ? 'checked' : ''} ${c.Null === 'YES' ? '' : 'disabled'} style="width:auto"> NULL</label>
      ${!row ? `<label style="display:inline-flex;gap:5px"><input type="checkbox" class="omit" ${auto ? 'checked' : ''} style="width:auto"> Use default</label>` : ''}</div>`;
  }).join('');
  const m = modal({ title: row ? 'Edit row' : 'Insert row into ' + D.table, wide: true, body: `<div class="grid2">${html}</div>`, buttons: [{ label: 'Cancel', onclick: (e, c) => { c(); if (D.tab === 'insert') { D.tab = 'browse'; tabs([['browse', 'Browse'], ['structure', 'Structure'], ['insert', 'Insert row'], ['sql', 'SQL'], ['ops', 'Operations'], ['export', 'Export']], 'browse'); render(); } } },
    { label: row ? 'Save changes' : 'Insert', primary: true, onclick: async (el, close) => {
      const values = {}, nulls = [];
      $$('[data-f]', el).forEach(f => { const n = f.dataset.f, inp = $('input:not([type=checkbox]),textarea', f);
        if ($('.omit', f)?.checked) return; values[n] = inp.value; if ($('.isnull', f).checked) nulls.push(n); });
      try { await call(row ? 'update_row' : 'insert_row', { values, nulls, pk }); close(); toast(row ? 'Row updated' : 'Row inserted'); D.tab = 'browse'; tabs([['browse', 'Browse'], ['structure', 'Structure'], ['insert', 'Insert row'], ['sql', 'SQL'], ['ops', 'Operations'], ['export', 'Export']], 'browse'); render(); refreshTables().catch(() => {}); } catch (e) { fail(e); } } }] });
  $$('.omit', m.el).forEach(o => o.onchange = () => $$('input:not([type=checkbox]),textarea', o.closest('[data-f]')).forEach(i => i.disabled = o.checked));
  $$('.isnull', m.el).forEach(n => n.onchange = () => { const i = $('input:not([type=checkbox]),textarea', n.closest('[data-f]')); if (n.checked) i.value = ''; });
  if (D.tab === 'insert') $('#content').innerHTML = '<div class="empty">Fill in the form to insert a row.</div>';
}

/* ---------- SQL ---------- */
function sql() {
  $('#content').innerHTML = `<textarea class="sqlbox mono" id="sql" spellcheck="false" placeholder="SELECT * FROM ...">${D.table ? 'SELECT * FROM `' + D.table + '` LIMIT 50;' : ''}</textarea>
  <div class="tools"><button class="btn primary" id="run">Run SQL</button><span style="color:var(--muted)">Ctrl+Enter runs. Multiple statements are allowed.</span></div><div id="res"></div>`;
  const go = async () => {
    const res = $('#res'); res.innerHTML = '<div class="msg">Running…</div>';
    try {
      const r = await call('query', { sql: $('#sql').value });
      res.innerHTML = r.sets.map(s => s.type === 'affected' ? `<div class="msg">OK. ${s.affected} row(s) affected (${r.ms} ms).</div>` :
        `<div class="msg">${s.count} row(s) returned${s.truncated ? ' (showing first 1000)' : ''} (${r.ms} ms).</div><div style="overflow:auto"><table class="data"><tr>${s.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${s.rows.map(row => `<tr>${s.columns.map(c => row[c] === null ? '<td class="null">NULL</td>' : `<td title="${esc(row[c])}">${esc(row[c])}</td>`).join('')}</tr>`).join('')}</table></div>`).join('');
      if (/^\s*(create|drop|alter|rename)/i.test($('#sql').value)) refreshTables().catch(() => {});
    } catch (e) { res.innerHTML = `<div class="msg e">${esc(e.message)}</div>`; }
  };
  $('#run').onclick = go; $('#sql').onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go(); };
}

/* ---------- operations + export ---------- */
function ops() {
  $('#content').innerHTML = `<div class="stack" style="max-width:460px"><label>Rename table to<input id="rn" value="${esc(D.table)}"></label><div class="tools" style="margin-top:8px"><button class="btn" id="rb">Rename</button></div>
  <hr style="border:none;border-top:1px solid var(--rule2);margin:18px 0"><div class="tools"><button class="btn danger" id="tr">Empty table</button><button class="btn danger" id="dr">Drop table</button></div></div>`;
  $('#rb').onclick = async () => { try { const n = $('#rn').value.trim(); await call('rename_table', { new_name: n }); await refreshTables(); openTable(D.db, n, 'ops'); toast('Table renamed'); } catch (e) { fail(e); } };
  $('#tr').onclick = async () => { if (await confirmBox('Empty table', `Delete every row in "${D.table}"?`, 'Empty table', true)) try { await call('truncate_table'); await refreshTables(); toast('Table emptied'); } catch (e) { fail(e); } };
  $('#dr').onclick = async () => { if (await confirmBox('Drop table', `Permanently delete table "${D.table}"?`, 'Drop table', true)) try { await call('drop_table'); await refreshTables(); D.table = ''; drawTree(); openDb(D.db); toast('Table dropped'); } catch (e) { fail(e); } };
}
function exportTab() {
  $('#content').innerHTML = `<p>Download the structure and data of <b>${esc(D.table)}</b> as a .sql file.</p><div class="tools"><a class="btn primary" style="text-decoration:none" href="${API}?action=export&conn=${D.conn}&db=${encodeURIComponent(D.db)}&table=${encodeURIComponent(D.table)}&_csrf=${CSRF}">Download .sql</a></div>`;
}

loadConns().then(() => { if (!D.conns.length) $('#manageConn').click(); }).catch(fail);
