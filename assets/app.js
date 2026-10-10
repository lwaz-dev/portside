/* Portside file transfer */
const S = { sessions: [], cur: -1, sort: { key: 'name', dir: 1 }, sel: new Set(), anchor: null, view: [], stage: [], jobs: [], active: 0, sites: [] };
const cs = () => S.sessions[S.cur];
const FTP = 'api/ftp.php';

/* ---------- log ---------- */
function log(msg, kind = '') {
  const d = document.createElement('div'); if (kind) d.className = kind;
  d.innerHTML = `<time>${new Date().toLocaleTimeString()}</time>${esc(msg)}`; const l = $('#log'); l.append(d); l.scrollTop = l.scrollHeight;
}
$$('.bottom .tab').forEach(t => t.onclick = () => {
  $$('.bottom .tab').forEach(x => x.classList.toggle('on', x === t));
  $('#queue').hidden = t.dataset.b !== 'queue'; $('#log').hidden = t.dataset.b !== 'log';
});

/* ---------- sessions ---------- */
async function openSession(conn, label) {
  log(`Status: Connecting to ${label}...`);
  try {
    const r = await api(FTP, { action: 'connect', conn });
    S.sessions.push({ conn, name: r.name || label, protocol: r.protocol, path: r.path, items: r.items });
    S.cur = S.sessions.length - 1; S.sel.clear(); log(`Status: Connected. Listing of "${r.path}" retrieved (${r.items.length} items).`, 's');
    renderTabs(); renderRemote();
  } catch (e) { log('Error: ' + e.message, 'e'); toast(e.message, true); }
}
function renderTabs() {
  const t = $('#sessionTabs'); t.innerHTML = '';
  S.sessions.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'tab' + (i === S.cur ? ' on' : '');
    d.innerHTML = `<span>${esc(s.name)}</span><button class="btn sm" aria-label="Disconnect" style="padding:0 6px">×</button>`;
    d.onclick = e => {
      if (e.target.tagName === 'BUTTON') { S.sessions.splice(i, 1); if (S.cur >= i) S.cur = Math.max(S.sessions.length ? 0 : -1, S.cur - 1); log('Status: Disconnected from ' + s.name); }
      else S.cur = i;
      S.sel.clear(); renderTabs(); renderRemote();
    };
    t.append(d);
  });
}
async function load(path) {
  const s = cs(); if (!s) return;
  log('Status: Retrieving directory listing of "' + path + '"...');
  try { const r = await api(FTP, { action: 'list', conn: s.conn, path }); s.path = path; s.items = r.items; S.sel.clear(); S.anchor = null; log(`Status: Directory listing of "${path}" successful`, 's'); renderRemote(); }
  catch (e) { log('Error: ' + e.message, 'e'); toast(e.message, true); }
}
const refresh = () => cs() && load(cs().path);
const parent = p => { const a = p.replace(/\/+$/, '').split('/'); a.pop(); return a.join('/') || '/'; };
const join = (d, n) => d.replace(/\/+$/, '') + '/' + n;

/* ---------- remote list ---------- */
function renderRemote() {
  const s = cs(), box = $('#remoteList');
  $('#pathIn').value = s ? s.path : ''; $('#remoteTitle').textContent = s ? s.name : 'Remote site';
  $$('#remotePane [data-act]').forEach(b => b.disabled = !s);
  if (!s) { box.innerHTML = '<div class="empty">Not connected.<br>Use Quick connect above or open the Site manager.</div>'; $('#remoteStatus').textContent = 'Not connected'; updateSel(); return; }
  const k = S.sort.key, d = S.sort.dir;
  S.view = [...s.items].sort((a, b) => ((a.type === 'dir') !== (b.type === 'dir')) ? (a.type === 'dir' ? -1 : 1) : (k === 'name' ? a.name.localeCompare(b.name, undefined, { numeric: true }) : ((a[k] > b[k]) - (a[k] < b[k]))) * d);
  const arrow = key => key === k ? (d > 0 ? ' ▲' : ' ▼') : '';
  let h = `<table class="files"><colgroup><col><col style="width:90px"><col style="width:140px"><col style="width:100px"></colgroup><thead><tr>
    <th data-k="name">Name${arrow('name')}</th><th data-k="size" class="num">Size${arrow('size')}</th><th data-k="modified">Modified${arrow('modified')}</th><th data-k="perms">Permissions${arrow('perms')}</th></tr></thead><tbody>`;
  if (s.path !== '/') h += `<tr class="row up" data-up="1"><td>${ICON.dir}..</td><td></td><td></td><td></td></tr>`;
  S.view.forEach(i => h += `<tr class="row ${S.sel.has(i.name) ? 'sel' : ''}" data-name="${esc(i.name)}"><td title="${esc(i.name)}">${ICON[i.type]}${esc(i.name)}</td><td class="num">${i.type === 'dir' ? '' : fmtSize(i.size)}</td><td>${fmtDate(i.modified)}</td><td class="perm">${esc(i.perms)}</td></tr>`);
  box.innerHTML = h + '</tbody></table>' + (s.items.length ? '' : '<div class="empty">This folder is empty. Drop files here to upload.</div>');
  const dirs = s.items.filter(i => i.type === 'dir').length;
  $('#remoteStatus').textContent = `${s.items.length - dirs} files and ${dirs} folders · ${fmtSize(s.items.reduce((a, i) => a + (i.type === 'dir' ? 0 : i.size), 0))}`;
  updateSel();
}
function updateSel() {
  const n = S.sel.size, one = n === 1 ? S.view.find(i => i.name === [...S.sel][0]) : null;
  const on = (a, v) => { const b = $(`[data-act=${a}]`); if (b) b.disabled = !cs() || !v; };
  on('download', n > 0); on('delete', n > 0); on('chmod', n > 0); on('rename', n === 1); on('edit', one && one.type !== 'dir');
}
$('#remoteList').addEventListener('click', e => {
  const th = e.target.closest('th'); if (th) { const k = th.dataset.k; S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : 1 }; return renderRemote(); }
  const tr = e.target.closest('tr.row'); if (!tr) { S.sel.clear(); return renderRemote(); }
  if (tr.dataset.up) return;
  const n = tr.dataset.name;
  if (e.shiftKey && S.anchor) { const a = S.view.findIndex(i => i.name === S.anchor), b = S.view.findIndex(i => i.name === n); S.sel = new Set(S.view.slice(Math.min(a, b), Math.max(a, b) + 1).map(i => i.name)); }
  else if (e.ctrlKey || e.metaKey) { S.sel.has(n) ? S.sel.delete(n) : S.sel.add(n); S.anchor = n; }
  else { S.sel = new Set([n]); S.anchor = n; }
  renderRemote();
});
$('#remoteList').addEventListener('dblclick', e => {
  const tr = e.target.closest('tr.row'); if (!tr) return; if (tr.dataset.up) return load(parent(cs().path));
  const it = cs().items.find(i => i.name === tr.dataset.name); if (!it) return;
  it.type === 'dir' || it.type === 'link' ? load(join(cs().path, it.name)) : act('edit');
});
$('#remoteList').addEventListener('contextmenu', e => {
  e.preventDefault(); const tr = e.target.closest('tr.row');
  if (tr && !tr.dataset.up && !S.sel.has(tr.dataset.name)) { S.sel = new Set([tr.dataset.name]); S.anchor = tr.dataset.name; renderRemote(); }
  const n = S.sel.size, one = n === 1 ? S.view.find(i => i.name === [...S.sel][0]) : null;
  showMenu(e.clientX, e.clientY, [
    { label: 'Open / enter folder', disabled: !one || one.type === 'file', run: () => load(join(cs().path, one.name)) },
    { label: 'Download', disabled: !n, run: () => act('download') }, { label: 'Edit', disabled: !one || one.type === 'dir', run: () => act('edit') }, '-',
    { label: 'Rename', disabled: n !== 1, run: () => act('rename') }, { label: 'File permissions', disabled: !n, run: () => act('chmod') },
    { label: 'Delete', disabled: !n, run: () => act('delete') }, '-',
    { label: 'Create folder', run: () => act('mkdir') }, { label: 'Create empty file', run: () => act('newfile') }, { label: 'Upload files…', run: () => { $('#fileIn').dataset.direct = '1'; $('#fileIn').click(); } }, { label: 'Refresh', run: refresh }]);
});
$('#remoteList').addEventListener('keydown', e => {
  if (e.key === 'Delete') act('delete'); else if (e.key === 'F2') act('rename'); else if (e.key === 'F5') { e.preventDefault(); refresh(); }
  else if (e.key === 'Backspace' && cs()) { e.preventDefault(); load(parent(cs().path)); }
  else if (e.key === 'Enter' && S.sel.size === 1) { const it = cs().items.find(i => i.name === [...S.sel][0]); it.type === 'file' ? act('edit') : load(join(cs().path, it.name)); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); S.sel = new Set(S.view.map(i => i.name)); renderRemote(); }
});
$('#pathIn').addEventListener('keydown', e => { if (e.key === 'Enter') load(e.target.value.trim() || '/'); });
$$('#remotePane [data-act]').forEach(b => b.onclick = () => act(b.dataset.act));

/* ---------- actions ---------- */
const selItems = () => [...S.sel].map(n => cs().items.find(i => i.name === n)).filter(Boolean);
async function run(label, fn) { try { log('Status: ' + label); await fn(); log('Status: ' + label + ' – done', 's'); await refresh(); } catch (e) { log('Error: ' + e.message, 'e'); toast(e.message, true); } }
async function act(a) {
  const s = cs(); if (!s) return; const sel = selItems();
  if (a === 'up') return load(parent(s.path));
  if (a === 'refresh') return refresh();
  if (a === 'mkdir') { const n = await ask('Create folder', 'Folder name'); if (n) run('Creating folder ' + n, () => api(FTP, { action: 'mkdir', conn: s.conn, path: join(s.path, n) })); }
  if (a === 'newfile') { const n = await ask('Create empty file', 'File name'); if (n) run('Creating file ' + n, () => api(FTP, { action: 'newfile', conn: s.conn, path: join(s.path, n) })); }
  if (a === 'rename' && sel.length === 1) { const n = await ask('Rename', 'New name', sel[0].name); if (n && n !== sel[0].name) run('Renaming ' + sel[0].name, () => api(FTP, { action: 'rename', conn: s.conn, from: join(s.path, sel[0].name), to: join(s.path, n) })); }
  if (a === 'delete' && sel.length) {
    const m = sel.length === 1 ? `Delete "${sel[0].name}"${sel[0].type === 'dir' ? ' and everything in it' : ''}? This cannot be undone.` : `Delete ${sel.length} items? Folders are deleted with their contents. This cannot be undone.`;
    if (await confirmBox('Delete', m, 'Delete', true)) run('Deleting ' + sel.length + ' item(s)', () => api(FTP, { action: 'delete', conn: s.conn, items: sel.map(i => ({ path: join(s.path, i.name), type: i.type })) }));
  }
  if (a === 'download') sel.filter(i => i.type !== 'dir').forEach((i, n) => setTimeout(() => download(join(s.path, i.name)), n * 400)), sel.some(i => i.type === 'dir') && toast('Folders cannot be downloaded directly. Select the files inside.', true);
  if (a === 'edit' && sel.length === 1 && sel[0].type !== 'dir') editFile(join(s.path, sel[0].name), sel[0].name);
  if (a === 'chmod' && sel.length) chmodDialog(sel);
}
function download(path) {
  const a = document.createElement('a'); a.href = `${FTP}?action=download&conn=${encodeURIComponent(cs().conn)}&path=${encodeURIComponent(path)}&_csrf=${CSRF}`; a.download = ''; document.body.append(a); a.click(); a.remove(); log('Status: Downloading ' + path);
}
async function editFile(path, name) {
  const s = cs(); let content;
  try { content = (await api(FTP, { action: 'read', conn: s.conn, path })).content; } catch (e) { log('Error: ' + e.message, 'e'); return toast(e.message, true); }
  modal({ title: 'Edit ' + path, wide: true, body: `<textarea class="editor" spellcheck="false">${esc(content)}</textarea>`, buttons: [
    { label: 'Close' }, { label: 'Save to server', primary: true, onclick: async (el, close) => {
      try { await api(FTP, { action: 'write', conn: s.conn, path, content: $('textarea', el).value }); log('Status: Saved ' + path, 's'); toast('Saved ' + name); close(); refresh(); } catch (e) { toast(e.message, true); } } }] });
}
function chmodDialog(sel) {
  const first = sel[0].perms || '', init = [...first.slice(1, 10)].map(c => c !== '-');
  const names = ['Read', 'Write', 'Execute'], who = ['Owner', 'Group', 'Public'];
  let g = '<table class="data"><tr><th></th>' + names.map(n => `<th>${n}</th>`).join('') + '</tr>';
  who.forEach((w, r) => { g += `<tr><th>${w}</th>` + names.map((n, c) => `<td><input type="checkbox" data-i="${r * 3 + c}" ${init[r * 3 + c] ? 'checked' : ''}></td>`).join('') + '</tr>'; }); g += '</table>';
  const m = modal({ title: 'Permissions for ' + (sel.length === 1 ? sel[0].name : sel.length + ' items'), body: `${g}<div class="stack" style="margin-top:12px"><label>Numeric value<input class="mono" id="oct" maxlength="4"></label></div>`, buttons: [
    { label: 'Cancel' }, { label: 'Apply', primary: true, onclick: (el, close) => run('Changing permissions', () => api(FTP, { action: 'chmod', conn: cs().conn, mode: $('#oct', el).value, paths: sel.map(i => join(cs().path, i.name)) }).then(close)) }] });
  const boxes = $$('input[type=checkbox]', m.el), oct = $('#oct', m.el);
  const toOct = () => oct.value = [0, 3, 6].map(r => (boxes[r].checked ? 4 : 0) + (boxes[r + 1].checked ? 2 : 0) + (boxes[r + 2].checked ? 1 : 0)).join('');
  boxes.forEach(b => b.onchange = toOct); toOct();
  oct.oninput = () => { if (/^[0-7]{3}$/.test(oct.value)) [...oct.value].forEach((d, r) => { boxes[r * 3].checked = d & 4; boxes[r * 3 + 1].checked = d & 2; boxes[r * 3 + 2].checked = d & 1; }); };
}

/* ---------- local staging + uploads ---------- */
function addStage(list) { list.forEach(x => S.stage.push(x)); renderStage(); }
function renderStage() {
  const b = $('#stage');
  b.innerHTML = S.stage.length ? '<table class="files"><colgroup><col><col style="width:80px"><col style="width:34px"></colgroup>' + S.stage.map((x, i) => `<tr class="row"><td title="${esc(x.rel)}">${ICON.file}${esc(x.rel)}</td><td class="num">${fmtSize(x.file.size)}</td><td><a href="#" data-rm="${i}" aria-label="Remove">×</a></td></tr>`).join('') + '</table>'
    : '<div class="empty">Browsers cannot read your disk directly.<br>Add files or a folder here, or drop them on the remote side to upload.</div>';
  $('#uploadAll').disabled = $('#clearStage').disabled = !S.stage.length;
}
$('#stage').onclick = e => { const a = e.target.closest('[data-rm]'); if (a) { e.preventDefault(); S.stage.splice(+a.dataset.rm, 1); renderStage(); } };
$('#addFiles').onclick = () => { delete $('#fileIn').dataset.direct; $('#fileIn').click(); }; $('#addFolder').onclick = () => $('#dirIn').click();
const fromInput = inp => [...inp.files].map(f => ({ file: f, rel: f.webkitRelativePath || f.name }));
$('#fileIn').onchange = e => { const l = fromInput(e.target); e.target.value = ''; cs() && e.target.dataset.direct ? enqueue(l) : addStage(l); };
$('#dirIn').onchange = e => { addStage(fromInput(e.target)); e.target.value = ''; };
$('#clearStage').onclick = () => { S.stage = []; renderStage(); };
$('#uploadAll').onclick = () => { if (!cs()) return toast('Connect to a site first.', true); enqueue(S.stage); S.stage = []; renderStage(); };

async function walk(entry, base = '') {
  if (entry.isFile) return new Promise(r => entry.file(f => r([{ file: f, rel: base + f.name }]), () => r([])));
  const rd = entry.createReader(), all = []; let batch;
  do { batch = await new Promise(r => rd.readEntries(r, () => r([]))); all.push(...batch); } while (batch.length);
  return (await Promise.all(all.map(e => walk(e, base + entry.name + '/')))).flat();
}
const remote = $('#remoteList');
['dragenter', 'dragover'].forEach(ev => remote.addEventListener(ev, e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); remote.classList.add('drop'); } }));
['dragleave', 'drop'].forEach(ev => remote.addEventListener(ev, () => remote.classList.remove('drop')));
remote.addEventListener('drop', async e => {
  e.preventDefault(); if (!cs()) return toast('Connect to a site first.', true);
  const entries = [...e.dataTransfer.items].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  const files = entries.length ? (await Promise.all(entries.map(en => walk(en)))).flat() : [...e.dataTransfer.files].map(f => ({ file: f, rel: f.name }));
  enqueue(files);
});

function enqueue(files) {
  const s = cs(); files.forEach(x => S.jobs.push({ id: S.jobs.length, conn: s.conn, dir: s.path, rel: x.rel, file: x.file, status: 'wait', pct: 0 }));
  log(`Status: ${files.length} file(s) added to the transfer queue`); renderQueue(); pump();
}
function pump() {
  while (S.active < 2) { const j = S.jobs.find(x => x.status === 'wait'); if (!j) break; startJob(j); }
  if (!S.active && !S.jobs.some(x => x.status === 'wait') && S.jobs.some(x => x.status === 'done')) { S.jobs.forEach(j => j.flushed = true); refresh(); }
}
function startJob(j) {
  j.status = 'run'; S.active++; log('Status: Uploading ' + j.rel);
  const fd = new FormData(); fd.append('action', 'upload'); fd.append('conn', j.conn); fd.append('dir', j.dir); fd.append('rel', j.rel); fd.append('file', j.file, j.file.name);
  const x = new XMLHttpRequest(); x.open('POST', FTP); x.setRequestHeader('X-CSRF', CSRF);
  const end = (ok, msg) => { j.status = ok ? 'done' : 'fail'; j.pct = ok ? 100 : j.pct; j.err = msg; S.active--; log(ok ? 'Status: Transferred ' + j.rel : `Error: ${j.rel}: ${msg}`, ok ? 's' : 'e'); renderQueue(); pump(); };
  x.upload.onprogress = e => { j.pct = e.lengthComputable ? Math.round(e.loaded / e.total * 100) : 0; renderQueue(); };
  x.onload = () => { let r = {}; try { r = JSON.parse(x.responseText); } catch (e) {} end(!!r.ok, r.error || 'Unexpected server response (file may exceed post_max_size)'); };
  x.onerror = () => end(false, 'Network error'); x.send(fd);
}
function renderQueue() {
  const q = $('#queue'); if (!S.jobs.length) { q.innerHTML = '<span style="color:var(--muted)">No transfers yet.</span>'; return; }
  q.innerHTML = '<div style="margin-bottom:4px"><button class="btn sm" id="clearQ">Clear finished</button> <button class="btn sm" id="retryQ">Retry failed</button></div>' + S.jobs.map(j =>
    `<div class="q ${j.status}"><span title="${esc(j.rel)}${j.err ? ' — ' + esc(j.err) : ''}">${esc(j.rel)}${j.err ? ' — ' + esc(j.err) : ''}</span><div class="bar"><i style="width:${j.pct}%"></i></div><span>${{ wait: 'Queued', run: j.pct + '%', done: 'Done', fail: 'Failed' }[j.status]}</span></div>`).join('');
  $('#clearQ').onclick = () => { S.jobs = S.jobs.filter(j => j.status === 'wait' || j.status === 'run'); renderQueue(); };
  $('#retryQ').onclick = () => { S.jobs.filter(j => j.status === 'fail').forEach(j => { j.status = 'wait'; j.pct = 0; j.err = ''; }); renderQueue(); pump(); };
}

/* ---------- quick connect + site manager ---------- */
$('#quick').onsubmit = async e => {
  e.preventDefault(); const d = Object.fromEntries(new FormData(e.target));
  try { await api('api/sites.php', { action: 'quick', ...d }); openSession('quick', d.host); } catch (er) { toast(er.message, true); }
};
$('#siteMgr').onclick = async () => {
  let sites = (await api('api/sites.php', { action: 'list' })).ftp, cur = null;
  const m = modal({ title: 'Site manager', wide: true, body: '<div class="sites"><div><ul id="siteList"></ul><button class="btn sm" id="newSite" style="margin-top:8px">New site</button></div><div id="siteForm"></div></div>', buttons: [
    { label: 'Close' }, { label: 'Delete', danger: true, onclick: async () => { if (cur && cur.id && await confirmBox('Delete site', `Delete "${cur.name}"?`, 'Delete', true)) { await api('api/sites.php', { action: 'delete_ftp', id: cur.id }); sites = sites.filter(s => s.id != cur.id); cur = null; draw(); } } },
    { label: 'Save', onclick: () => save() }, { label: 'Save and connect', primary: true, onclick: async (el, close) => { const id = await save(); if (id) { close(); openSession(String(id), cur.name); } } }] });
  const list = $('#siteList', m.el), form = $('#siteForm', m.el);
  function draw() {
    list.innerHTML = sites.map(s => `<li data-id="${s.id}" class="${cur && cur.id == s.id ? 'on' : ''}">${esc(s.name)}<small>${esc(s.protocol.toUpperCase())} · ${esc(s.host)}</small></li>`).join('') || '<li style="cursor:default;color:var(--muted)">No saved sites yet</li>';
    if (!cur) { form.innerHTML = '<div class="empty">Select a site, or choose New site.</div>'; return; }
    form.innerHTML = `<div class="grid2">
      <label class="span2">Site name<input name="name" value="${esc(cur.name)}"></label>
      <label>Protocol<select name="protocol">${['ftp:FTP', 'ftps:FTPS (explicit TLS)', 'sftp:SFTP (SSH)'].map(p => { const [v, l] = p.split(':'); return `<option value="${v}" ${cur.protocol === v ? 'selected' : ''}>${l}</option>`; }).join('')}</select></label>
      <label>Port<input name="port" value="${esc(cur.port)}"></label>
      <label class="span2">Host<input name="host" value="${esc(cur.host)}" placeholder="ftp.example.com"></label>
      <label>Username<input name="username" value="${esc(cur.username)}" autocomplete="off"></label>
      <label>Password<input name="password" type="password" placeholder="${cur.id ? 'Leave blank to keep saved password' : ''}" autocomplete="new-password"></label>
      <label>Start folder<input name="initial_dir" value="${esc(cur.initial_dir)}"></label>
      <label style="align-self:end"><input type="checkbox" name="passive" ${cur.passive ? 'checked' : ''} style="display:inline;width:auto"> Passive mode</label></div>`;
    $('[name=protocol]', form).onchange = e => { const p = $('[name=port]', form); if (['21', '22', ''].includes(p.value)) p.value = e.target.value === 'sftp' ? 22 : 21; };
  }
  async function save() {
    const d = { action: 'save_ftp', id: cur.id || '' }; $$('[name]', form).forEach(i => d[i.name] = i.type === 'checkbox' ? i.checked : i.value);
    try { const r = await api('api/sites.php', d); toast('Site saved'); sites = (await api('api/sites.php', { action: 'list' })).ftp; cur = sites.find(s => s.id == r.id); draw(); return r.id; } catch (e) { toast(e.message, true); return null; }
  }
  list.onclick = e => { const li = e.target.closest('li[data-id]'); if (li) { cur = { ...sites.find(s => s.id == li.dataset.id) }; draw(); } };
  $('#newSite', m.el).onclick = () => { cur = { name: 'New site', protocol: 'ftp', port: 21, host: '', username: '', initial_dir: '/', passive: 1 }; draw(); };
  draw();
};

renderStage(); renderRemote(); renderQueue();
log('Status: Ready. Connect with Quick connect or the Site manager.');
