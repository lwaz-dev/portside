const CSRF = document.querySelector('meta[name=csrf]').content;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, data = {}) {
  const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF': CSRF }, body: JSON.stringify(data) });
  let j; try { j = await r.json(); } catch (e) { throw new Error('The server sent an unexpected response (HTTP ' + r.status + ').'); }
  if (!j.ok) { if (r.status === 401) location.href = 'login.php'; throw new Error(j.error || 'Request failed'); }
  return j;
}
function toast(msg, err) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; document.body.append(t);
  setTimeout(() => t.remove(), err ? 6000 : 3000);
}
function fmtSize(n) { if (n == null) return ''; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; n = +n; while (n >= 1024 && i < 4) { n /= 1024; i++; } return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i]; }
function fmtDate(ts) { if (!ts) return ''; const d = new Date(ts * 1000), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; }

/* modal({title, body(html), buttons:[{label, primary, danger, onclick(el, close)}], wide}) */
function modal({ title, body, buttons = [], wide = false, onopen }) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><div class="body">${body}</div><div class="foot"></div></div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onkey); };
  const onkey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onkey);
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  const foot = $('.foot', bg);
  buttons.forEach(b => { const x = document.createElement('button'); x.className = 'btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : ''); x.textContent = b.label; x.onclick = () => b.onclick ? b.onclick(bg, close, x) : close(); foot.append(x); });
  document.body.append(bg); const f = $('input,textarea,select', bg); if (f) f.focus(); if (onopen) onopen(bg, close);
  return { el: bg, close };
}
function ask(title, label, value = '') {
  return new Promise(res => {
    let done = false; const fin = (v, close) => { if (done) return; done = true; close(); res(v); };
    const m = modal({ title, body: `<div class="stack"><label>${esc(label)}<input class="mono" value="${esc(value)}"></label></div>`,
      buttons: [{ label: 'Cancel', onclick: (el, c) => fin(null, c) }, { label: 'OK', primary: true, onclick: (el, c) => fin($('input', el).value, c) }] });
    const i = $('input', m.el); i.select(); i.addEventListener('keydown', e => { if (e.key === 'Enter') fin(i.value, m.close); });
    new MutationObserver(() => { if (!document.body.contains(m.el)) { done = true; res(null); } }).observe(document.body, { childList: true });
  });
}
function confirmBox(title, msg, okLabel = 'OK', danger = false) {
  return new Promise(res => modal({ title, body: `<p>${esc(msg)}</p>`, buttons: [
    { label: 'Cancel', onclick: (e, c) => { c(); res(false); } }, { label: okLabel, primary: !danger, danger, onclick: (e, c) => { c(); res(true); } }] }));
}
function showMenu(x, y, items) {
  $$('.ctx').forEach(e => e.remove());
  const m = document.createElement('div'); m.className = 'ctx';
  items.forEach(i => { if (i === '-') { m.append(document.createElement('hr')); return; } const b = document.createElement('button'); b.textContent = i.label; b.disabled = !!i.disabled; b.onclick = () => { m.remove(); i.run(); }; m.append(b); });
  document.body.append(m); const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px'; m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
}
const ICON = {
  dir: '<svg class="ico" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5h4.5l1.5 1.5h7v7.5h-13z" fill="#d9a21b"/></svg>',
  link: '<svg class="ico" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 10l4-4M7 4.5l1-1a3 3 0 014 4l-1 1M9 11.5l-1 1a3 3 0 01-4-4l1-1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  file: '<svg class="ico" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5h6l3 3v10h-9z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>'
};
