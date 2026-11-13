'use strict';
/* =====================================================================
   Core client: helpers · state · api · auth · socket · chat list ·
   messages · composer · popups.   (ui.js = panels/settings, media.js = editor/stories)
   ===================================================================== */

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fnum = (n) => Number(n).toLocaleString(localeOf());
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const COLORS = ['#e17076', '#e8964f', '#a695e7', '#6bb85a', '#4fb8bd', '#5c9fd6', '#d86fa5'];

const P = {
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  checks: '<path d="M1.5 12.5l4.5 4.5L16 7"/><path d="M11 15.5l1.5 1.5L22.5 7"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  reply: '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  dots: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
  chev: '<polyline points="9 18 15 12 9 6"/>',
  play: '<polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  mega: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4a4 4 0 0 0 4-4C21 6.5 17 2 12 2z"/>',
  crop: '<path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/>',
  rotate: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  pen: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
  type: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
  flip: '<path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><line x1="12" y1="2" x2="12" y2="22"/>',
  undo: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
};
const ic = (n, s = 22) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

const dtf = (o) => new Intl.DateTimeFormat(localeOf(), o);
const tf = { format: (x) => dtf({ hour: '2-digit', minute: '2-digit', hour12: false }).format(x) };
const df = { format: (x) => dtf({ year: 'numeric', month: 'long', day: 'numeric' }).format(x) };
const dsf = { format: (x) => dtf({ month: 'short', day: 'numeric' }).format(x) };
const wf = { format: (x) => dtf({ weekday: 'long' }).format(x) };
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const daysAgo = (ts) => Math.round((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 864e5);
const dayLabel = (ts) => { const n = daysAgo(ts); return n === 0 ? t('today') : n === 1 ? t('yesterday') : n < 7 ? wf.format(ts) : df.format(ts); };
const listTime = (ts) => { const n = daysAgo(ts); return n === 0 ? tf.format(ts) : n === 1 ? t('yesterday') : n < 7 ? wf.format(ts) : dsf.format(ts); };
const fsize = (b) => (b < 1024 ? fnum(b) + ' B' : b < 1048576 ? fnum(Math.round(b / 1024)) + ' KB' : fnum((b / 1048576).toFixed(1)) + ' MB');
const fdur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const URL_RE = /https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"،؛]/g;
function linkify(text) {
  let out = '', last = 0;
  for (const m of text.matchAll(URL_RE)) {
    out += esc(text.slice(last, m.index));
    out += `<a href="${esc(m[0])}" target="_blank" rel="noopener noreferrer">${esc(m[0])}</a>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

function avatar(u, size = 44, { dot = false } = {}) {
  const name = (u && u.display_name) || '?';
  const inner = u && u.avatar ? `<img src="${esc(u.avatar)}" alt="" loading="lazy">` : `<span>${esc([...name.trim()][0] || '?')}</span>`;
  return `<div class="av" style="--s:${size}px;background:${COLORS[((u && u.id) || 0) % COLORS.length]}">${inner}${dot ? '<i class="dot"></i>' : ''}</div>`;
}
const savedAvatar = (size) => `<div class="av saved-av" style="--s:${size}px">${ic('bookmark', Math.round(size * 0.5))}</div>`;

/* ---------- state ---------- */
const S = {
  token: localStorage.getItem('token'),
  cfg: { app_name: 'Messenger', max_upload_mb: 50 },
  me: null, users: new Map(), online: new Set(), chats: new Map(), stories: [],
  activeId: null, msgs: [], hasMore: false, loadingOlder: false,
  ctx: null, typing: new Map(), socket: null,
  stick: true, newCount: 0, pushed: false, rec: null,
  popupHandler: null, popupAt: 0, lastTypingSent: 0, pendingInvite: null,
};
const userOf = (id) => S.users.get(id);
const isMobile = () => matchMedia('(max-width: 800px)').matches;
const isOwner = () => !!S.me && S.me.role === 'owner';
const visibleUser = (u) => !u.banned || isOwner();
const peerOf = (c) => userOf(c.peer.id) || c.peer;
const senderOf = (m) => (m.sender ? userOf(m.sender.id) || m.sender : null);
const isGroupish = (c) => c.type === 'group' || c.type === 'channel';
const canPostChat = (c) => c.type === 'dm' || c.type === 'saved' || c.created_by === S.me.id || (c.type === 'group' && !c.closed);
const chatTitle = (c) => (c.type === 'dm' ? peerOf(c).display_name : c.type === 'saved' ? t('saved') : c.title);
const TYPE_LABEL = () => ({ image: '📷', video: '🎬', voice: '🎤', file: '📎' });
const previewText = (m) => (m.text ? m.text.replace(/\s+/g, ' ').slice(0, 100) : (TYPE_LABEL()[m.type] || '') + ' ' + ({ image: t('media'), video: t('media'), voice: t('voice'), file: t('files') }[m.type] || ''));

function chatAvatar(c, size = 52, { dot = false } = {}) {
  if (c.type === 'saved') return savedAvatar(size);
  if (c.type === 'dm') { const p = peerOf(c); return avatar(p, size, { dot: dot && S.online.has(p.id) }); }
  return avatar({ id: c.id, display_name: c.title, avatar: c.avatar }, size);
}

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3400);
}

/* two-tap inline confirmation (replaces dialogs) */
function armConfirm(btn, action) {
  btn.addEventListener('click', () => {
    if (btn.dataset.armed) { clearTimeout(btn._t); delete btn.dataset.armed; btn.classList.remove('armed'); btn.innerHTML = btn._label; action(); return; }
    btn.dataset.armed = '1'; btn._label = btn.innerHTML; btn.classList.add('armed');
    btn.innerHTML = `${ic('check', 18)}<span>${esc(t('confirm'))}</span>`;
    btn._t = setTimeout(() => { delete btn.dataset.armed; btn.classList.remove('armed'); btn.innerHTML = btn._label; }, 3500);
  });
}

/* ---------- api ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  const init = { method, headers };
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  let r;
  try { r = await fetch('/api' + path, init); } catch { throw new Error(t('err_network')); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (d.code === 'banned') logout(false, terr(d.error));
    else if (r.status === 401 && S.token && !path.startsWith('/auth')) logout(true);
    throw new Error(terr(d.error));
  }
  return d;
}

function uploadForm(path, fd, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api' + path);
    x.setRequestHeader('Authorization', 'Bearer ' + S.token);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    x.onload = () => {
      let d = {};
      try { d = JSON.parse(x.responseText); } catch { /* ignore */ }
      x.status >= 200 && x.status < 300 ? resolve(d) : reject(new Error(x.status === 413 ? t('err_big') : terr(d.error)));
    };
    x.onerror = () => reject(new Error(t('err_network')));
    x.send(fd);
  });
}

/* =====================================================================
   LANGUAGE + AUTH
   ===================================================================== */
function showLangScreen(onPick) {
  const el = $('#langScreen');
  $('#langGrid').innerHTML = LANGS.map((l) => `<button type="button" class="lang-btn" data-lang="${l.c}">${esc(l.n)}</button>`).join('');
  $('#langGrid').onclick = (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    setLang(b.dataset.lang);
    el.classList.add('out');
    setTimeout(() => { el.classList.add('hidden'); el.classList.remove('out'); }, 260);
    (onPick || start)();
  };
  el.classList.remove('hidden');
}

const authErr = (m = '') => { $('#authErr').textContent = m; };
const busy = (form, on) => $$('button', form).forEach((b) => { if (b.type !== 'button') b.disabled = on; });
function setAuthView(view) {
  $$('.tab').forEach((x) => x.classList.toggle('on', x.dataset.tab === view));
  $('#loginForm').classList.toggle('hidden', view !== 'login');
  $('#regForm').classList.toggle('hidden', view !== 'reg');
  authErr();
}

function initAuth() {
  $$('.tab').forEach((x) => (x.onclick = () => setAuthView(x.dataset.tab)));
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    busy(f, true);
    try { startSession(await api('/auth/login', { method: 'POST', body: { login: f.login.value, password: f.password.value } })); }
    catch (err) { authErr(err.message); }
    busy(f, false);
  };
  let timer;
  $('#regUser').oninput = (e) => {
    const el = e.target, st = $('#userStatus');
    el.value = el.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    clearTimeout(timer);
    if (!el.value) { st.textContent = ''; return; }
    if (!/^[a-z][a-z0-9_]{2,19}$/.test(el.value)) { st.className = 'hint bad'; st.textContent = t('id_rules'); return; }
    st.className = 'hint'; st.textContent = t('checking');
    const v = el.value;
    timer = setTimeout(async () => {
      try {
        const r = await api('/auth/check-username?u=' + v);
        if (v !== el.value) return;
        st.className = 'hint ' + (r.available ? 'ok' : 'bad');
        st.textContent = r.available ? t('id_free') : t('id_taken');
      } catch { st.textContent = ''; }
    }, 350);
  };
  $('#regForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    busy(f, true);
    try { startSession(await api('/auth/register', { method: 'POST', body: { username: f.username.value, display_name: f.display_name.value, password: f.password.value } })); }
    catch (err) { authErr(err.message); }
    busy(f, false);
  };
}

function startSession(r) {
  S.token = r.token;
  localStorage.setItem('token', r.token);
  S.me = r.user;
  $('#loginForm').reset(); $('#regForm').reset(); $('#userStatus').textContent = '';
  boot();
}

function logout(expired, msg) {
  localStorage.removeItem('token');
  S.token = null;
  if (S.socket) S.socket.disconnect();
  S.socket = null;
  if (S.rec) stopRec(true);
  Object.assign(S, { me: null, users: new Map(), online: new Set(), chats: new Map(), stories: [], activeId: null, msgs: [], ctx: null, typing: new Map(), pushed: false });
  closeAllPanels(); closeScreen(); closePopup();
  $('#app').classList.add('hidden'); $('#app').classList.remove('chat-open');
  $('#chatView').classList.add('hidden'); $('#joinView').classList.add('hidden'); $('#emptyState').classList.remove('hidden');
  document.title = S.cfg.app_name;
  setAuthView('login');
  $('#auth').classList.remove('hidden');
  authErr(msg || (expired ? t('err_session') : ''));
}

/* =====================================================================
   SOCKET
   ===================================================================== */
function connectSocket() {
  if (S.socket) S.socket.disconnect();
  const s = (S.socket = io({ auth: { token: S.token } }));
  let first = true;
  s.on('connect', () => { if (!first) resync(); first = false; });
  s.on('connect_error', (e) => { if (e.message === 'unauthorized') logout(true); });

  s.on('presence:init', ({ ids }) => { S.online = new Set(ids); refreshPresence(); });
  s.on('presence', ({ user_id, online, last_seen }) => {
    online ? S.online.add(user_id) : S.online.delete(user_id);
    const u = userOf(user_id);
    if (u && last_seen !== undefined) u.last_seen = last_seen;
    refreshPresence();
  });

  s.on('user:new', ({ user }) => S.users.set(user.id, user));
  s.on('user:update', ({ user }) => {
    S.users.set(user.id, { ...(userOf(user.id) || {}), ...user });
    if (S.me && user.id === S.me.id) Object.assign(S.me, user);
    for (const c of S.chats.values()) if (c.type === 'dm' && c.peer.id === user.id) c.peer = { ...c.peer, ...user };
    renderChatList(); renderOnline(); renderStories();
    if (S.activeId) { renderHead(); renderAllMessages('keep'); }
  });
  s.on('user:delete', ({ id }) => {
    S.users.delete(id);
    S.stories = S.stories.filter((x) => x.user_id !== id);
    for (const [cid, c] of S.chats) if (c.type === 'dm' && c.peer.id === id) { S.chats.delete(cid); if (S.activeId === cid) closeChat(true); }
    renderChatList(); renderOnline(); renderStories();
  });

  s.on('chat:new', ({ chat }) => { S.chats.set(chat.id, { ...(S.chats.get(chat.id) || {}), ...chat }); renderChatList(); });
  s.on('chat:update', ({ chat }) => {
    const c = S.chats.get(chat.id);
    if (c) Object.assign(c, chat);
    renderChatList();
    if (S.activeId === chat.id) { renderHead(); syncComposerState(); refreshInfoPanel(); }
  });
  s.on('chat:delete', ({ id }) => { S.chats.delete(id); if (S.activeId === id) closeChat(true); renderChatList(); });
  s.on('chat:cleared', ({ chat_id }) => {
    const c = S.chats.get(chat_id);
    if (c) { c.last = null; c.unread = 0; }
    if (S.activeId === chat_id) { S.msgs = []; S.hasMore = false; renderAllMessages('bottom'); }
    renderChatList(); updateTitle();
  });

  s.on('message:new', onNewMessage);
  s.on('message:edit', ({ message }) => {
    updateMessage(message);
    const c = S.chats.get(message.chat_id);
    if (c && c.last && c.last.id === message.id) { c.last.text = message.text; renderChatList(); }
  });
  s.on('message:delete', ({ chat_id, id }) => removeMessage(chat_id, id));
  s.on('message:reaction', ({ chat_id, message_id, reactions }) => {
    if (chat_id !== S.activeId) return;
    const m = S.msgs.find((x) => x.id === message_id);
    if (m) { m.reactions = reactions; updateMessage(m); }
  });
  s.on('chat:read', ({ chat_id, user_id, last_id }) => {
    const c = S.chats.get(chat_id);
    if (c && c.type === 'dm' && c.peer.id === user_id) {
      c.peer_read = Math.max(c.peer_read || 0, last_id);
      if (S.activeId === chat_id) refreshTicks();
    }
  });
  s.on('typing', ({ chat_id, user_id }) => {
    if (user_id === S.me.id) return;
    const map = S.typing.get(chat_id) || new Map();
    clearTimeout(map.get(user_id));
    map.set(user_id, setTimeout(() => { map.delete(user_id); refreshStatus(); renderChatList(); }, 4000));
    S.typing.set(chat_id, map);
    refreshStatus(); renderChatList();
  });
  s.on('story:new', ({ story }) => { S.stories.push(story); renderStories(); });
  s.on('story:delete', ({ id }) => { S.stories = S.stories.filter((x) => x.id !== id); renderStories(); });
}

async function resync() {
  try {
    await loadChats(); await loadStories();
    if (S.activeId && S.chats.has(S.activeId)) {
      const id = S.activeId;
      const r = await api(`/chats/${id}/messages?limit=50`);
      if (S.activeId !== id) return;
      S.msgs = r.messages; S.hasMore = r.has_more;
      const c = S.chats.get(id);
      if (c && r.peer_read != null) c.peer_read = r.peer_read;
      renderAllMessages(S.stick ? 'bottom' : 'keep');
    }
  } catch { /* retried on next reconnect */ }
}

function refreshPresence() { renderOnline(); renderChatList(); if (S.activeId) refreshStatus(); }

/* =====================================================================
   SIDEBAR
   ===================================================================== */
async function loadChats() {
  const r = await api('/chats');
  S.chats = new Map(r.chats.map((c) => [c.id, c]));
  renderChatList(); updateTitle();
}
async function loadStories() { S.stories = (await api('/stories')).stories; renderStories(); }

function typingText(c) {
  const map = S.typing.get(c.id);
  if (!map || !map.size) return '';
  if (c.type === 'dm') return t('typing');
  const names = [...map.keys()].map((id) => (userOf(id) || {}).display_name).filter(Boolean);
  return names.length ? `${names.join(', ')} ${t('typing')}` : '';
}

function lastPreview(c) {
  const l = c.last;
  if (!l) return `<span>${esc(t('no_messages'))}</span>`;
  let pre = '';
  if (l.sender_id === S.me.id) pre = t('you') + ': ';
  else if (c.type === 'group') pre = ((userOf(l.sender_id) || {}).display_name || l.sender_name || t('deleted_acc')) + ': ';
  return esc(pre + previewText(l));
}

const kindIcon = (c) => (c.type === 'channel' ? `<span class="kind">${ic('mega', 14)}</span>` : c.type === 'group' ? `<span class="kind">${ic('users', 14)}</span>` : '');

function chatItem(c) {
  const typing = typingText(c);
  return `<div class="ci${c.id === S.activeId ? ' on' : ''}" data-chat="${c.id}">${chatAvatar(c, 52, { dot: true })}
    <div class="ci-main">
      <div class="ci-row"><span class="ci-title">${kindIcon(c)}${esc(chatTitle(c))}${c.type === 'group' && c.closed ? ' 🔒' : ''}</span><span class="ci-time">${c.last ? listTime(c.last.created_at) : ''}</span></div>
      <div class="ci-row"><span class="ci-sub${typing ? ' typing' : ''}">${typing ? esc(typing) : lastPreview(c)}</span>${c.unread ? `<span class="badge">${fnum(c.unread)}</span>` : ''}</div>
    </div></div>`;
}

const badges = (u) => (u.role === 'owner' ? `<span class="tag">${esc(t('owner_tag'))}</span>` : '') + (u.banned ? `<span class="tag bad">${esc(t('banned_tag'))}</span>` : '');
const userRow = (u, attr = 'data-uid') => `<div class="ci" ${attr}="${u.id}">${avatar(u, 46, { dot: S.online.has(u.id) })}
  <div class="ci-main"><div class="ci-title">${esc(u.display_name)}${badges(u)}</div><div class="ci-sub">@${esc(u.username)}</div></div></div>`;

function renderChatList() {
  if (!S.me) return;
  const q = $('#search').value.trim().toLowerCase();
  // a private chat with no messages stays hidden until opened — but its user must still be findable
  const shown = [...S.chats.values()].filter((c) => c.type !== 'dm' || c.last || c.id === S.activeId);
  shown.sort((a, b) => (b.type === 'saved') - (a.type === 'saved') || ((b.last && b.last.created_at) || b.created_at) - ((a.last && a.last.created_at) || a.created_at));
  const match = (c) => chatTitle(c).toLowerCase().includes(q) || (c.type === 'dm' && peerOf(c).username.includes(q));
  let html = (q ? shown.filter(match) : shown).map(chatItem).join('');
  if (q) {
    const have = new Set(shown.filter((c) => c.type === 'dm').map((c) => c.peer.id));
    const users = [...S.users.values()].filter((u) => u.id !== S.me.id && visibleUser(u) && !have.has(u.id) && (u.display_name.toLowerCase().includes(q) || u.username.includes(q)));
    if (users.length) html += `<div class="sec">${esc(t('users'))}</div>` + users.map((u) => userRow(u)).join('');
  }
  $('#chatList').innerHTML = html || `<div class="empty-list">${esc(q ? '—' : t('no_chats'))}</div>`;
}

function renderOnline() {
  if (!S.me) return;
  const list = [...S.online].filter((id) => id !== S.me.id).map(userOf).filter((u) => u && visibleUser(u));
  const el = $('#onlineStrip');
  el.classList.toggle('hidden', !list.length);
  el.innerHTML = list.map((u) => `<div class="os-item" data-uid="${u.id}">${avatar(u, 50, { dot: true })}<span>${esc(u.display_name.split(' ')[0])}</span></div>`).join('');
}

function renderStories() {
  if (!S.me) return;
  const by = new Map();
  for (const s of S.stories) { if (!by.has(s.user_id)) by.set(s.user_id, []); by.get(s.user_id).push(s); }
  const mine = by.get(S.me.id);
  const others = [...by.entries()].filter(([id]) => id !== S.me.id && userOf(id))
    .sort((a, b) => a[1].every((x) => x.seen) - b[1].every((x) => x.seen) || b[1][b[1].length - 1].created_at - a[1][a[1].length - 1].created_at);
  const ring = (ss) => (ss.every((x) => x.seen) ? 'seen' : 'new');
  let html = `<div class="st-item" data-st="${S.me.id}"><div class="ring ${mine ? ring(mine) : 'none'}">${avatar(S.me, 50)}${mine ? '' : `<i class="st-plus">${ic('plus', 12)}</i>`}</div><span>${esc(t('my_story'))}</span></div>`;
  html += others.map(([id, ss]) => `<div class="st-item" data-st="${id}"><div class="ring ${ring(ss)}">${avatar(userOf(id), 50)}</div><span>${esc(userOf(id).display_name.split(' ')[0])}</span></div>`).join('');
  $('#storyStrip').innerHTML = html;
}

function updateTitle() {
  const n = [...S.chats.values()].reduce((a, c) => a + (c.unread || 0), 0);
  document.title = (n ? `(${fnum(n)}) ` : '') + S.cfg.app_name;
}

async function openDM(uid) {
  const ex = [...S.chats.values()].find((c) => c.type === 'dm' && c.peer.id === uid);
  try {
    let id = ex && ex.id;
    if (!id) {
      const r = await api('/chats/dm', { method: 'POST', body: { user_id: uid } });
      S.chats.set(r.chat.id, r.chat);
      id = r.chat.id;
    }
    closeAllPanels();
    $('#search').value = '';
    openChat(id);
  } catch (e) { toast(e.message, 'err'); }
}

/* =====================================================================
   CHAT VIEW
   ===================================================================== */
function seenText(u) {
  if (S.online.has(u.id)) return t('online');
  if (!u.last_seen) return t('seen_recently');
  if (Date.now() - u.last_seen < 60000) return t('seen_now');
  const n = daysAgo(u.last_seen);
  return t('seen_at', { t: n === 0 ? tf.format(u.last_seen) : n === 1 ? t('yesterday') + ' ' + tf.format(u.last_seen) : df.format(u.last_seen) });
}

function statusText(c) {
  const ty = typingText(c);
  if (ty) return { text: ty, on: true };
  if (c.type === 'dm') { const p = peerOf(c); return { text: seenText(p), on: S.online.has(p.id) }; }
  if (c.type === 'saved') return { text: '', on: false };
  return { text: t('members_n', { n: fnum(c.members_count || 1) }), on: false };
}

function renderHead() {
  const c = S.chats.get(S.activeId);
  if (!c) return;
  $('#headAv').innerHTML = chatAvatar(c, 42);
  $('#headTitle').textContent = chatTitle(c);
  refreshStatus();
}

function refreshStatus() {
  const c = S.chats.get(S.activeId);
  if (!c) return;
  const s = statusText(c);
  const el = $('#headSub');
  el.textContent = s.text;
  el.classList.toggle('on', s.on);
}

function syncComposerState() {
  const c = S.chats.get(S.activeId);
  const blocked = c ? !canPostChat(c) : false;
  $('#composer').classList.toggle('hidden', blocked);
  $('#closedNote').classList.toggle('hidden', !blocked);
  if (blocked) { $('#closedNote').textContent = c.type === 'channel' ? t('channel_note') : t('closed_note'); if (S.ctx) clearCtx(); }
}

async function openChat(id) {
  if (S.rec) stopRec(true);
  closeAllPanels('info');
  S.activeId = id; S.ctx = null; S.msgs = []; S.hasMore = false; S.newCount = 0; S.stick = true;
  if (isMobile() && !S.pushed) { history.pushState({ chat: 1 }, ''); S.pushed = true; }
  $('#app').classList.add('chat-open');
  $('#emptyState').classList.add('hidden'); $('#joinView').classList.add('hidden');
  $('#chatView').classList.remove('hidden');
  $('#msgList').innerHTML = '';
  $('#jumpDown').classList.add('hidden');
  renderHead(); renderCtx(); syncComposerState(); resetInput(); renderChatList();
  try {
    const r = await api(`/chats/${id}/messages?limit=50`);
    if (S.activeId !== id) return;
    S.msgs = r.messages; S.hasMore = r.has_more;
    const c = S.chats.get(id);
    if (c && r.peer_read != null) c.peer_read = r.peer_read;
    renderAllMessages('bottom');
    markRead();
  } catch (e) { toast(e.message, 'err'); }
  if (!isMobile() && canPostChat(S.chats.get(id) || { type: 'dm' })) $('#input').focus();
}

function closeChat(fromPop) {
  if (!fromPop && S.pushed) { history.back(); return; }
  S.pushed = false;
  if (S.rec) stopRec(true);
  closeAllPanels('info');
  S.activeId = null; S.msgs = []; S.ctx = null;
  $('#app').classList.remove('chat-open');
  $('#chatView').classList.add('hidden'); $('#joinView').classList.add('hidden');
  $('#emptyState').classList.remove('hidden');
  renderChatList();
}

function markRead() {
  const c = S.chats.get(S.activeId);
  if (!c || document.visibilityState !== 'visible') return;
  const last = S.msgs.length ? S.msgs[S.msgs.length - 1].id : 0;
  if (!last) return;
  c.unread = 0;
  renderChatList(); updateTitle();
  if ((c.my_read || 0) >= last) return;
  c.my_read = last;
  api(`/chats/${c.id}/read`, { method: 'POST', body: { last_id: last } }).catch(() => {});
}

async function onNewMessage({ message: m }) {
  const c = S.chats.get(m.chat_id);
  if (!c) { try { await loadChats(); } catch { /* ignore */ } return; }
  c.last = { id: m.id, type: m.type, text: m.text, created_at: m.created_at, sender_id: m.sender ? m.sender.id : null, sender_name: m.sender ? m.sender.display_name : null };
  const mine = !!m.sender && m.sender.id === S.me.id;
  if (S.activeId === m.chat_id) {
    const had = S.msgs.some((x) => x.id === m.id);
    addMessage(m, mine);
    if (!mine && !had) document.visibilityState === 'visible' ? markRead() : (c.unread = (c.unread || 0) + 1);
  } else if (!mine) c.unread = (c.unread || 0) + 1;
  renderChatList(); updateTitle();
}

/* ---------- messages: rendering ---------- */
const dayHTML = (ts) => `<div class="day"><span>${esc(dayLabel(ts))}</span></div>`;

function ticksHTML(m) {
  const c = S.chats.get(m.chat_id);
  if (!c || !m.sender || m.sender.id !== S.me.id || c.type === 'saved') return '';
  const seen = c.type === 'dm' && (c.peer_read || 0) >= m.id;
  return `<span class="ticks${seen ? ' seen' : ''}" data-tid="${m.id}">${ic(seen ? 'checks' : 'check', 16)}</span>`;
}
function refreshTicks() {
  $$('.ticks').forEach((el) => { const m = S.msgs.find((x) => x.id === +el.dataset.tid); if (m) el.outerHTML = ticksHTML(m); });
}

function mediaHTML(m) {
  const f = m.file;
  if (!f) return '';
  const url = esc(f.url);
  if (m.type === 'image') return `<img class="media-el" src="${url}" alt="" loading="lazy" data-lb="${url}">`;
  if (m.type === 'video') return `<video class="media-el" src="${url}" controls preload="metadata" playsinline></video>`;
  if (m.type === 'voice') {
    return `<div class="voice"><button class="vplay" type="button" data-vplay>${ic('play', 18)}</button>
      <div class="vbar" data-vbar><div class="vfill"></div></div><span class="vtime">${fdur(f.duration || 0)}</span>
      <audio preload="metadata" src="${url}" data-dur="${f.duration || 0}"></audio></div>`;
  }
  return `<a class="file" href="${url}" download="${esc(f.name || 'file')}" target="_blank" rel="noopener"><span class="fi">${ic('file', 22)}</span>
    <span><b>${esc(f.name || 'file')}</b><small>${fsize(f.size || 0)}</small></span></a>`;
}

function msgHTML(m, prev) {
  const mine = m.sender && m.sender.id === S.me.id;
  const c = S.chats.get(m.chat_id);
  const group = c && c.type === 'group';
  const s = senderOf(m);
  const first = !prev || (prev.sender && prev.sender.id) !== (m.sender && m.sender.id) || dayKey(prev.created_at) !== dayKey(m.created_at);
  const name = s ? s.display_name : t('deleted_acc');
  const color = COLORS[((s && s.id) || 0) % COLORS.length];
  const slot = group && !mine ? `<div class="av-slot">${first && s ? `<span data-user="${s.id}" class="clickable">${avatar(s, 34)}</span>` : ''}</div>` : '';
  const head = group && !mine && first ? `<div class="sname clickable" data-user="${s ? s.id : ''}" style="color:${color}">${esc(name)}</div>` : '';
  const fwd = m.fwd ? `<div class="fwd">↪ ${esc(t('fwd', { n: m.fwd }))}</div>` : '';
  const reply = m.reply ? `<div class="reply" data-goto="${m.reply.id}"><b>${esc(m.reply.name || t('deleted_acc'))}</b><span>${esc(previewText(m.reply))}</span></div>` : '';
  const text = m.text ? `<div class="text" dir="auto">${linkify(m.text)}</div>` : '';
  const reacts = m.reactions.length
    ? `<div class="reacts">${m.reactions.map((r) => `<button class="react${r.users.includes(S.me.id) ? ' me' : ''}" type="button" data-react="${esc(r.emoji)}" title="${esc(r.users.map((id) => (userOf(id) || {}).display_name || '').filter(Boolean).join(', '))}">${esc(r.emoji)} <b>${fnum(r.users.length)}</b></button>`).join('')}</div>` : '';
  const media = m.file && (m.type === 'image' || m.type === 'video');
  return `<div class="row ${mine ? 'mine' : 'theirs'}" id="m-${m.id}" data-id="${m.id}">${slot}
    <div class="bubble${media ? ' media' : ''}">
      <button class="more" type="button" data-more>${ic('down', 16)}</button>
      ${head}${fwd}${reply}${mediaHTML(m)}${text}${reacts}
      <div class="meta">${m.edited_at ? `<span>${esc(t('edited'))}</span>` : ''}<span>${tf.format(m.created_at)}</span>${ticksHTML(m)}</div>
    </div></div>`;
}

function renderAllMessages(mode) {
  const sc = $('#msgScroll');
  const prevH = sc.scrollHeight, prevT = sc.scrollTop;
  let html = '';
  S.msgs.forEach((m, i) => {
    const prev = S.msgs[i - 1];
    if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) html += dayHTML(m.created_at);
    html += msgHTML(m, prev);
  });
  $('#msgList').innerHTML = html;
  if (mode === 'bottom') scrollBottom(false);
  else if (mode === 'keepTop') sc.scrollTop = prevT + (sc.scrollHeight - prevH);
  else sc.scrollTop = sc.scrollHeight - (prevH - prevT);
}

function scrollBottom(smooth = true) {
  const sc = $('#msgScroll');
  const go = () => sc.scrollTo({ top: sc.scrollHeight, behavior: smooth && prefs().anim ? 'smooth' : 'auto' });
  go();
  S.stick = true; S.newCount = 0;
  $('#jumpDown').classList.add('hidden');
}

function addMessage(m, mine) {
  if (m.chat_id !== S.activeId || S.msgs.some((x) => x.id === m.id)) return;
  const prev = S.msgs[S.msgs.length - 1];
  S.msgs.push(m);
  let html = '';
  if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) html += dayHTML(m.created_at);
  html += msgHTML(m, prev);
  $('#msgList').insertAdjacentHTML('beforeend', html);
  if (mine || S.stick) scrollBottom(!!prev);
  else { S.newCount++; $('#jumpBadge').textContent = fnum(S.newCount); $('#jumpBadge').classList.remove('hidden'); $('#jumpDown').classList.remove('hidden'); }
}

function updateMessage(m) {
  const i = S.msgs.findIndex((x) => x.id === m.id);
  if (i < 0) return;
  S.msgs[i] = m;
  const el = $('#m-' + m.id);
  if (!el) return;
  const tpl = document.createElement('template');
  tpl.innerHTML = msgHTML(m, S.msgs[i - 1]).trim();
  el.replaceWith(tpl.content.firstElementChild);
}

function removeMessage(chatId, id) {
  const c = S.chats.get(chatId);
  if (chatId === S.activeId) {
    const el = $('#m-' + id);
    S.msgs = S.msgs.filter((m) => m.id !== id);
    S.msgs.forEach((m) => { if (m.reply && m.reply.id === id) m.reply = null; });
    if (S.ctx && S.ctx.msg.id === id) clearCtx();
    if (el && prefs().anim) { el.classList.add('leaving'); setTimeout(() => renderAllMessages('keep'), 220); } else renderAllMessages('keep');
  }
  if (c && c.last && c.last.id === id) loadChats().catch(() => {});
}

async function loadOlder() {
  if (S.loadingOlder || !S.hasMore || !S.msgs.length) return;
  S.loadingOlder = true;
  const id = S.activeId;
  try {
    const r = await api(`/chats/${id}/messages?before=${S.msgs[0].id}&limit=50`);
    if (S.activeId !== id) return;
    S.msgs = [...r.messages, ...S.msgs]; S.hasMore = r.has_more;
    renderAllMessages('keepTop');
  } catch { /* ignore */ } finally { S.loadingOlder = false; }
}

function gotoMessage(id) {
  const el = $('#m-' + id);
  if (!el) { toast(t('no_media')); return; }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1400);
}

/* =====================================================================
   COMPOSER
   ===================================================================== */
function autosize() {
  const sc = $('#msgScroll'), t = $('#input'), wasStuck = S.stick;
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 140) + 'px';
  t.dir = t.value ? 'auto' : document.documentElement.dir;
  if (wasStuck) sc.scrollTop = sc.scrollHeight; // keep the chat pinned while the box grows
}

function syncSend() {
  const has = $('#input').value.trim().length > 0 || (S.ctx && S.ctx.type === 'edit');
  const b = $('#btnSend');
  b.dataset.mode = has ? 'send' : 'mic';
  b.innerHTML = ic(has ? 'send' : 'mic');
}
function resetInput() { $('#input').value = ''; autosize(); syncSend(); }

function setCtx(type, msg) {
  S.ctx = { type, msg };
  renderCtx();
  if (type === 'edit') { $('#input').value = msg.text; autosize(); }
  syncSend();
  $('#input').focus();
}
function clearCtx() {
  const wasEdit = S.ctx && S.ctx.type === 'edit';
  S.ctx = null; renderCtx();
  if (wasEdit) resetInput();
}
function renderCtx() {
  const b = $('#ctxBar');
  if (!S.ctx) { b.classList.remove('open'); setTimeout(() => !S.ctx && b.classList.add('hidden'), 200); return; }
  const { type, msg } = S.ctx;
  const s = senderOf(msg);
  b.classList.remove('hidden');
  b.innerHTML = `${ic(type === 'edit' ? 'edit' : 'reply', 20)}<div class="cx-main"><b>${esc(type === 'edit' ? t('editing') : t('replying_to', { n: s ? s.display_name : t('deleted_acc') }))}</b><span>${esc(previewText(msg))}</span></div><button class="icon-btn" type="button" data-cx-close>${ic('x', 20)}</button>`;
  requestAnimationFrame(() => b.classList.add('open'));
}

async function submitComposer() {
  const c = S.chats.get(S.activeId);
  if (!c) return;
  const ta = $('#input');
  const text = ta.value.trim();
  if (S.ctx && S.ctx.type === 'edit') {
    const msg = S.ctx.msg;
    if (!text && !msg.file) return;
    try {
      if (text !== msg.text) updateMessage((await api('/messages/' + msg.id, { method: 'PATCH', body: { text } })).message);
      clearCtx();
    } catch (e) { toast(e.message, 'err'); }
    return;
  }
  if (!text) return;
  const body = { text, reply_to: S.ctx && S.ctx.type === 'reply' ? S.ctx.msg.id : undefined };
  resetInput(); clearCtx();
  try {
    const r = await api(`/chats/${c.id}/messages`, { method: 'POST', body });
    onNewMessage({ message: r.message });
  } catch (e) { toast(e.message, 'err'); ta.value = text; autosize(); syncSend(); }
}

function setProgress(p) {
  $('#upbar').classList.toggle('hidden', p === null);
  if (p !== null) $('#upbar i').style.width = Math.round(p * 100) + '%';
}

/* send one file/blob as a message; returns the created message */
async function sendOne(file, { chatId = S.activeId, caption = '', duration, replyTo, name } = {}) {
  const fd = new FormData();
  fd.append('file_name', name || file.name || 'file');
  if (duration) fd.append('duration', duration);
  if (caption) fd.append('text', caption);
  if (replyTo) fd.append('reply_to', replyTo);
  fd.append('file', file);
  try {
    setProgress(0);
    const r = await uploadForm(`/chats/${chatId}/messages`, fd, setProgress);
    onNewMessage({ message: r.message });
    return r.message;
  } finally { setProgress(null); }
}

/* files picked/pasted/dropped: images & videos go through the media composer, the rest are sent directly */
async function handleFiles(files, chatId = S.activeId) {
  const c = S.chats.get(chatId);
  if (!c) return;
  if (!canPostChat(c)) { toast(c.type === 'channel' ? t('channel_note') : t('closed_note'), 'err'); return; }
  const max = S.cfg.max_upload_mb * 1048576;
  for (const f of files) {
    if (!f.size) continue;
    if (f.size > max) { toast(`${f.name}: ${t('err_big')}`, 'err'); continue; }
    const isImg = f.type.startsWith('image/') && f.type !== 'image/gif';
    if (isImg || f.type.startsWith('video/')) {
      await openMediaComposer(f, { mode: 'chat', chatId });
    } else {
      const caption = S.activeId === chatId && !(S.ctx && S.ctx.type === 'edit') ? $('#input').value.trim() : '';
      const replyTo = S.ctx && S.ctx.type === 'reply' ? S.ctx.msg.id : undefined;
      try { await sendOne(f, { chatId, caption, replyTo }); if (caption) resetInput(); clearCtx(); } catch (e) { toast(e.message, 'err'); break; }
    }
  }
}

/* ---------- voice recording ---------- */
async function startRec() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { toast(t('err_generic'), 'err'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast(t('err_generic'), 'err'); return; }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((x) => MediaRecorder.isTypeSupported(x));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const R = (S.rec = { rec, start: Date.now(), cancel: false, chatId: S.activeId });
  R.timer = setInterval(() => { $('#recTime').textContent = fdur((Date.now() - R.start) / 1000); }, 250);
  rec.onstop = () => {
    stream.getTracks().forEach((x) => x.stop());
    clearInterval(R.timer);
    if (S.rec === R) S.rec = null;
    $('#recBar').classList.add('hidden');
    syncComposerState();
    if (R.cancel) return;
    const dur = Math.round((Date.now() - R.start) / 1000);
    if (dur < 1) return;
    const type = rec.mimeType || mime || 'audio/webm';
    const replyTo = S.ctx && S.ctx.type === 'reply' ? S.ctx.msg.id : undefined;
    sendOne(new File([new Blob(chunks, { type })], 'voice', { type }), { chatId: R.chatId, duration: dur, replyTo, name: 'voice' }).then(() => clearCtx()).catch((e) => toast(e.message, 'err'));
  };
  rec.start();
  $('#recTime').textContent = '0:00';
  $('#composer').classList.add('hidden');
  $('#recBar').classList.remove('hidden');
}
function stopRec(cancel) {
  if (!S.rec) return;
  S.rec.cancel = cancel;
  if (S.rec.rec.state !== 'inactive') S.rec.rec.stop();
}

/* =====================================================================
   POPUPS (context menus — no dialogs anywhere)
   ===================================================================== */
function popup(html, x, y, handler, { right = false } = {}) {
  const m = $('#menu');
  m.innerHTML = html;
  m.classList.remove('hidden', 'show');
  m.style.left = '0px'; m.style.top = '0px';
  const w = m.offsetWidth, h = m.offsetHeight;
  const left = right ? x - w : x;
  m.style.left = Math.max(8, Math.min(left, innerWidth - w - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
  requestAnimationFrame(() => m.classList.add('show'));
  S.popupHandler = handler; S.popupAt = Date.now();
}
function closePopup() { const m = $('#menu'); m.classList.remove('show'); m.classList.add('hidden'); S.popupHandler = null; }

function openMsgMenu(id, x, y) {
  const m = S.msgs.find((z) => z.id === id);
  const c = m && S.chats.get(m.chat_id);
  if (!m || !c) return;
  const mine = m.sender && m.sender.id === S.me.id;
  const write = canPostChat(c);
  const delAll = mine || c.type === 'dm' || (isGroupish(c) && c.created_by === S.me.id);
  let h = `<div class="rx">${REACTIONS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div><div class="sep"></div>`;
  if (write) h += `<button type="button" data-act="reply">${ic('reply', 18)}${esc(t('reply'))}</button>`;
  if (m.text) h += `<button type="button" data-act="copy">${ic('copy', 18)}${esc(t('copy'))}</button>`;
  if (c.type !== 'saved') h += `<button type="button" data-act="save">${ic('bookmark', 18)}${esc(t('save_msg'))}</button>`;
  if (mine && write) h += `<button type="button" data-act="edit">${ic('edit', 18)}${esc(t('edit'))}</button>`;
  h += `<div class="sep"></div><button type="button" class="danger" data-act="del_me">${ic('trash', 18)}${esc(t('del_me'))}</button>`;
  if (delAll) h += `<button type="button" class="danger" data-act="del_all">${ic('trash', 18)}${esc(t('del_all'))}</button>`;

  popup(h, x, y, async (d) => {
    if (d.emoji) return react(m.id, d.emoji);
    try {
      if (d.act === 'reply') setCtx('reply', m);
      else if (d.act === 'edit') setCtx('edit', m);
      else if (d.act === 'copy') { await navigator.clipboard.writeText(m.text); toast(t('copied')); }
      else if (d.act === 'save') { await api(`/messages/${m.id}/save`, { method: 'POST' }); toast(t('saved_ok')); }
      else if (d.act === 'del_me' || d.act === 'del_all') {
        await api(`/messages/${m.id}?scope=${d.act === 'del_me' ? 'me' : 'all'}`, { method: 'DELETE' });
        removeMessage(m.chat_id, m.id);
      }
    } catch (e) { toast(e.message, 'err'); }
  });
}

async function react(messageId, emoji) {
  try {
    const r = await api(`/messages/${messageId}/reaction`, { method: 'PUT', body: { emoji } });
    const m = S.msgs.find((x) => x.id === messageId);
    if (m) { m.reactions = r.reactions; updateMessage(m); }
  } catch (e) { toast(e.message, 'err'); }
}

/* =====================================================================
   BOOT & EVENT BINDING
   ===================================================================== */
function showApp() { $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden'); }

async function boot() {
  showApp();
  try {
    const [u, c, st] = await Promise.all([api('/users'), api('/chats'), api('/stories')]);
    S.users = new Map(u.users.map((x) => [x.id, x]));
    S.users.set(S.me.id, { ...(userOf(S.me.id) || {}), ...S.me });
    S.chats = new Map(c.chats.map((x) => [x.id, x]));
    S.stories = st.stories;
    connectSocket();
    renderChatList(); renderOnline(); renderStories(); updateTitle();
    if (S.pendingInvite) handleInvite();
  } catch (e) { if (S.token) toast(e.message, 'err'); }
}

function fitViewport() {
  const h = window.visualViewport ? window.visualViewport.height : innerHeight;
  document.documentElement.style.setProperty('--vh', h + 'px');
  window.scrollTo(0, 0);
}

function bindStatic() {
  $('#logo').innerHTML = ic('send', 34);
  $('#langLogo').innerHTML = ic('globe', 34);
  $('#btnMenu').innerHTML = ic('menu');
  $('#btnBack').innerHTML = ic('back');
  $('#btnInfo').innerHTML = ic('info');
  $('#btnAttach').innerHTML = ic('clip');
  $('#recCancel').innerHTML = ic('trash');
  $('#recSend').innerHTML = ic('send');
  $('#fabNew').innerHTML = ic('edit', 24);
  $('#jumpDown').insertAdjacentHTML('afterbegin', ic('down'));
  $('#themeAuth').onclick = toggleTheme;
  syncSend();

  /* viewport: stops the page from jumping when the keyboard opens */
  fitViewport();
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => { fitViewport(); if (S.stick) $('#msgScroll').scrollTop = $('#msgScroll').scrollHeight; });
    window.visualViewport.addEventListener('scroll', () => window.scrollTo(0, 0));
  }
  window.addEventListener('resize', fitViewport);

  /* sidebar */
  $('#search').oninput = renderChatList;
  $('#btnMenu').onclick = openMainMenu;
  $('#fabNew').onclick = () => openUsersPanel('side', true);
  $('#chatList').onclick = (e) => {
    const chat = e.target.closest('[data-chat]');
    if (chat) return openChat(+chat.dataset.chat);
    const u = e.target.closest('[data-uid]');
    if (u) openDM(+u.dataset.uid);
  };
  $('#onlineStrip').onclick = (e) => { const u = e.target.closest('[data-uid]'); if (u) openDM(+u.dataset.uid); };
  $('#storyStrip').onclick = (e) => {
    const it = e.target.closest('[data-st]');
    if (!it) return;
    const uid = +it.dataset.st;
    if (uid === S.me.id && !S.stories.some((s) => s.user_id === uid)) return pickStory();
    openStoryViewer(uid);
  };

  /* chat header */
  $('#btnBack').onclick = () => closeChat(false);
  $('#headInfo').onclick = () => openChatInfo();
  $('#btnInfo').onclick = () => openChatInfo();
  window.addEventListener('popstate', () => { if (S.activeId || !$('#joinView').classList.contains('hidden')) closeChat(true); });

  /* messages */
  const list = $('#msgList'), sc = $('#msgScroll');
  sc.addEventListener('scroll', () => {
    S.stick = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 140;
    if (S.stick) { S.newCount = 0; $('#jumpDown').classList.add('hidden'); markRead(); } else $('#jumpDown').classList.remove('hidden');
    if (sc.scrollTop < 120) loadOlder();
  });
  $('#jumpDown').onclick = () => scrollBottom(true);
  list.addEventListener('load', () => { if (S.stick) sc.scrollTop = sc.scrollHeight; }, true);
  list.addEventListener('loadedmetadata', () => { if (S.stick) sc.scrollTop = sc.scrollHeight; }, true);

  list.addEventListener('click', (e) => {
    if (S.suppressClick) { S.suppressClick = false; return; }
    const tg = e.target, row = tg.closest('.row');
    const more = tg.closest('[data-more]');
    if (more && row) { const r = more.getBoundingClientRect(); return openMsgMenu(+row.dataset.id, r.left, r.bottom + 4); }
    const re = tg.closest('[data-react]');
    if (re && row) return react(+row.dataset.id, re.dataset.react);
    const g = tg.closest('[data-goto]');
    if (g) return gotoMessage(+g.dataset.goto);
    const lb = tg.closest('[data-lb]');
    if (lb) { $('#lbImg').src = lb.dataset.lb; $('#lightbox').classList.remove('hidden'); return; }
    const vp = tg.closest('[data-vplay]');
    if (vp) { const a = $('audio', vp.parentElement); return a.paused ? (pauseAllAudio(), a.play().catch(() => toast(t('err_generic'), 'err'))) : a.pause(); }
    const vb = tg.closest('[data-vbar]');
    if (vb) {
      const a = $('audio', vb.parentElement), r = vb.getBoundingClientRect();
      if (a.duration && isFinite(a.duration)) a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
      return;
    }
    const us = tg.closest('[data-user]');
    if (us && us.dataset.user) openProfile(+us.dataset.user, 'info');
  });
  list.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    e.preventDefault();
    openMsgMenu(+row.dataset.id, e.clientX, e.clientY);
  });
  let lp;
  list.addEventListener('touchstart', (e) => {
    const row = e.target.closest('.row');
    if (!row || e.target.closest('a,video,audio,button,.vbar')) return;
    const touch = e.touches[0];
    lp = setTimeout(() => { S.suppressClick = true; openMsgMenu(+row.dataset.id, touch.clientX, touch.clientY); }, 450);
  }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => list.addEventListener(ev, () => clearTimeout(lp), { passive: true }));

  /* voice player */
  const setPlayIcon = (a, playing) => { const b = $('[data-vplay]', a.parentElement); if (b) b.innerHTML = ic(playing ? 'pause' : 'play', 18); };
  document.addEventListener('play', (e) => { if (e.target.tagName === 'AUDIO') setPlayIcon(e.target, true); }, true);
  document.addEventListener('pause', (e) => { if (e.target.tagName === 'AUDIO') setPlayIcon(e.target, false); }, true);
  document.addEventListener('ended', (e) => {
    if (e.target.tagName !== 'AUDIO') return;
    setPlayIcon(e.target, false);
    $('.vfill', e.target.parentElement).style.width = '0';
    $('.vtime', e.target.parentElement).textContent = fdur(+e.target.dataset.dur || 0);
  }, true);
  document.addEventListener('timeupdate', (e) => {
    const a = e.target;
    if (a.tagName !== 'AUDIO' || !a.duration || !isFinite(a.duration)) return;
    $('.vfill', a.parentElement).style.width = (a.currentTime / a.duration) * 100 + '%';
    $('.vtime', a.parentElement).textContent = fdur(a.currentTime);
  }, true);

  /* composer */
  const ta = $('#input');
  ta.addEventListener('input', () => {
    autosize(); syncSend();
    if (S.socket && Date.now() - S.lastTypingSent > 2500 && ta.value && !(S.ctx && S.ctx.type === 'edit')) {
      S.lastTypingSent = Date.now();
      S.socket.emit('typing', { chat_id: S.activeId });
    }
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && prefs().enter && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); submitComposer(); }
  });
  ta.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData ? e.clipboardData.files : [])];
    if (files.length) { e.preventDefault(); handleFiles(files); }
  });
  // keep the keyboard open when tapping send (this was what made the page jump)
  ['pointerdown', 'mousedown', 'touchstart'].forEach((ev) => $('#btnSend').addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  $('#btnSend').onclick = () => ($('#btnSend').dataset.mode === 'send' ? submitComposer() : startRec());
  $('#composer').onsubmit = (e) => e.preventDefault();
  $('#btnAttach').onclick = () => $('#fileInput').click();
  $('#fileInput').onchange = (e) => { const files = [...e.target.files]; e.target.value = ''; handleFiles(files); };
  $('#ctxBar').onclick = (e) => { if (e.target.closest('[data-cx-close]')) clearCtx(); };
  $('#recCancel').onclick = () => stopRec(true);
  $('#recSend').onclick = () => stopRec(false);

  const pane = $('#chatPane');
  pane.addEventListener('dragover', (e) => { if (S.activeId) e.preventDefault(); });
  pane.addEventListener('drop', (e) => {
    if (!S.activeId || !e.dataTransfer.files.length) return;
    e.preventDefault();
    handleFiles([...e.dataTransfer.files]);
  });

  /* global */
  $('#menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act],[data-emoji]');
    if (!b || !S.popupHandler) return;
    const h = S.popupHandler;
    closePopup();
    h(b.dataset);
  });
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#menu') && Date.now() - S.popupAt > 400) closePopup(); });
  document.addEventListener('scroll', closePopup, true);
  $('#lightbox').onclick = () => { $('#lightbox').classList.add('hidden'); $('#lbImg').removeAttribute('src'); };
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#lightbox').classList.contains('hidden')) return $('#lightbox').click();
    if (!$('#menu').classList.contains('hidden')) return closePopup();
    if (!$('#screen').classList.contains('hidden')) return closeScreen();
    if (S.panels && S.panels.length) return S.panels[S.panels.length - 1].close();
    if (S.ctx) return clearCtx();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.activeId) markRead(); });
}

const pauseAllAudio = () => $$('audio').forEach((a) => a.pause());

async function init() {
  try { S.cfg = await (await fetch('/api/config')).json(); } catch { /* defaults */ }
  const m = location.pathname.match(/^\/(g|c)\/([\w-]{8,})$/);
  if (m) { S.pendingInvite = { kind: m[1], code: m[2] }; history.replaceState(null, '', '/'); }
  applyPrefs();
  bindStatic();
  initAuth();
  if (!LANG) { showLangScreen(); return; }
  setLang(LANG);
  start();
}

async function start() {
  applyStaticI18n();
  $$('.brand-name').forEach((e) => (e.textContent = S.cfg.app_name));
  document.title = S.cfg.app_name;
  syncSend();
  if (S.token) {
    try { S.me = await api('/me'); await boot(); return; } catch (e) { if (S.token) toast(e.message, 'err'); }
  }
  setAuthView(S.pendingInvite ? 'reg' : 'login');
  $('#auth').classList.remove('hidden');
}
