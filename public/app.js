'use strict';
/* =====================================================================
   Messenger client — vanilla JS, no build step.
   Sections: helpers · state · api · auth · socket · chat list · messages
             · composer · popups & modals · profile/groups · boot
   ===================================================================== */

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fnum = (n) => Number(n).toLocaleString('fa-IR');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const COLORS = ['#e17076', '#e8964f', '#a695e7', '#6bb85a', '#4fb8bd', '#5c9fd6', '#d86fa5'];
const TYPE_LABEL = { image: '📷 عکس', video: '🎬 ویدیو', voice: '🎤 پیام صوتی', file: '📎 فایل' };

const P = {
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  back: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
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
  play: '<polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>',
};
const ic = (n, s = 22) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;

const tf = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false });
const df = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
const dsf = new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' });
const wf = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' });
const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const daysAgo = (ts) => Math.round((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 864e5);
const dayLabel = (ts) => { const n = daysAgo(ts); return n === 0 ? 'امروز' : n === 1 ? 'دیروز' : n < 7 ? wf.format(ts) : df.format(ts); };
const listTime = (ts) => { const n = daysAgo(ts); return n === 0 ? tf.format(ts) : n === 1 ? 'دیروز' : n < 7 ? wf.format(ts) : dsf.format(ts); };
const fsize = (b) => (b < 1024 ? fnum(b) + ' بایت' : b < 1048576 ? fnum(Math.round(b / 1024)) + ' کیلوبایت' : fnum((b / 1048576).toFixed(1)) + ' مگابایت');
const fdur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const URL_RE = /https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"،؛]/g;
function linkify(t) {
  let out = '', last = 0;
  for (const m of t.matchAll(URL_RE)) {
    out += esc(t.slice(last, m.index));
    out += `<a href="${esc(m[0])}" target="_blank" rel="noopener noreferrer">${esc(m[0])}</a>`;
    last = m.index + m[0].length;
  }
  return out + esc(t.slice(last));
}

function avatar(u, size = 44, { dot = false } = {}) {
  const name = (u && u.display_name) || '؟';
  const inner = u && u.avatar ? `<img src="${esc(u.avatar)}" alt="" loading="lazy">` : `<span>${esc([...name.trim()][0] || '؟')}</span>`;
  return `<div class="av" style="--s:${size}px;background:${COLORS[((u && u.id) || 0) % COLORS.length]}">${inner}${dot ? '<i class="dot"></i>' : ''}</div>`;
}

/* ---------- state ---------- */
const S = {
  token: localStorage.getItem('token'),
  cfg: { app_name: 'پیام‌رسان', max_upload_mb: 50 },
  me: null, users: new Map(), online: new Set(), chats: new Map(),
  activeId: null, msgs: [], hasMore: false, loadingOlder: false,
  ctx: null, typing: new Map(), socket: null, modals: [],
  stick: true, newCount: 0, pushed: false, rec: null, reg: { email: '' },
  popupHandler: null, popupAt: 0, lastTypingSent: 0,
};
const userOf = (id) => S.users.get(id);
const isMobile = () => matchMedia('(max-width: 800px)').matches;
const isOwner = () => S.me && S.me.role === 'owner';
const visibleUser = (u) => !u.banned || isOwner();
const isClosed = (c) => c.closed && !isOwner();
const senderOf = (m) => (m.sender ? userOf(m.sender.id) || m.sender : null);
const preview = (m) => (m.text ? m.text.replace(/\s+/g, ' ').slice(0, 100) : TYPE_LABEL[m.type] || '');

/* ---------- toast / theme ---------- */
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3400);
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('theme', t);
  $('meta[name=theme-color]').content = t === 'dark' ? '#17212b' : '#3390ec';
  $('#themeAuth').innerHTML = ic(t === 'dark' ? 'sun' : 'moon');
}
const toggleTheme = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

/* ---------- api ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  const init = { method, headers };
  if (body !== undefined) { headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  let r;
  try { r = await fetch('/api' + path, init); } catch { throw new Error('ارتباط با سرور برقرار نیست'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (d.code === 'banned') logout(false, d.error);
    else if (r.status === 401 && S.token && !path.startsWith('/auth')) logout(true);
    throw new Error(d.error || 'خطایی رخ داد');
  }
  return d;
}

function uploadForm(path, fd, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api' + path);
    x.setRequestHeader('Authorization', 'Bearer ' + S.token);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    x.onload = () => {
      let d = {};
      try { d = JSON.parse(x.responseText); } catch { /* ignore */ }
      x.status >= 200 && x.status < 300 ? resolve(d) : reject(new Error(d.error || 'ارسال فایل ناموفق بود'));
    };
    x.onerror = () => reject(new Error('ارتباط با سرور برقرار نیست'));
    x.send(fd);
  });
}

/* =====================================================================
   AUTH
   ===================================================================== */
const authErr = (m = '') => { $('#authErr').textContent = m; };
const busy = (form, on) => $$('button', form).forEach((b) => { if (b.type !== 'button') b.disabled = on; });

function setAuthView(view) {
  $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === (view === 'login' ? 'login' : 'reg')));
  $('#loginForm').classList.toggle('hidden', view !== 'login');
  $('#regEmailForm').classList.toggle('hidden', view !== 'email');
  $('#regForm2').classList.toggle('hidden', view !== 'details');
  authErr();
}

let resendTimer;
function startResendCountdown(sec = 60) {
  const b = $('#resendBtn');
  clearInterval(resendTimer);
  let left = sec;
  const tick = () => {
    b.disabled = left > 0;
    b.textContent = left > 0 ? `ارسال دوباره کد (${fnum(left)})` : 'ارسال دوباره کد';
    if (left-- <= 0) clearInterval(resendTimer);
  };
  tick();
  resendTimer = setInterval(tick, 1000);
}

async function requestCode(email, form) {
  busy(form, true);
  try {
    await api('/auth/send-code', { method: 'POST', body: { email } });
    S.reg.email = email;
    $('#regSent').textContent = `کد ۶ رقمی به ${email} ارسال شد.`;
    setAuthView('details');
    startResendCountdown();
    $('#regForm2').code.focus();
  } catch (e) { authErr(e.message); }
  busy(form, false);
}

function initAuth() {
  $$('.tab').forEach((t) => (t.onclick = () => setAuthView(t.dataset.tab === 'login' ? 'login' : S.reg.email ? 'details' : 'email')));

  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    busy(f, true);
    try { startSession(await api('/auth/login', { method: 'POST', body: { login: f.login.value, password: f.password.value } })); }
    catch (err) { authErr(err.message); }
    busy(f, false);
  };

  $('#regEmailForm').onsubmit = (e) => { e.preventDefault(); requestCode(e.target.email.value.trim(), e.target); };
  $('#resendBtn').onclick = () => requestCode(S.reg.email, $('#regForm2'));
  $('#changeEmail').onclick = () => { S.reg.email = ''; setAuthView('email'); };

  let t;
  $('#regUser').oninput = (e) => {
    const el = e.target, st = $('#userStatus');
    el.value = el.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    clearTimeout(t);
    if (!el.value) { st.textContent = ''; return; }
    if (!/^[a-z][a-z0-9_]{2,19}$/.test(el.value)) { st.className = 'hint bad'; st.textContent = '۳ تا ۲۰ کاراکتر و شروع با حرف انگلیسی'; return; }
    st.className = 'hint'; st.textContent = 'در حال بررسی…';
    const v = el.value;
    t = setTimeout(async () => {
      try {
        const r = await api('/auth/check-username?u=' + v);
        if (v !== el.value) return;
        st.className = 'hint ' + (r.available ? 'ok' : 'bad');
        st.textContent = r.available ? 'این آیدی آزاد است ✓' : 'این آیدی قبلاً گرفته شده است';
      } catch { st.textContent = ''; }
    }, 350);
  };

  $('#regForm2').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    busy(f, true);
    try {
      startSession(await api('/auth/register', { method: 'POST', body: { email: S.reg.email, code: f.code.value, username: f.username.value, display_name: f.display_name.value, password: f.password.value } }));
    } catch (err) { authErr(err.message); }
    busy(f, false);
  };
}

function startSession(r) {
  S.token = r.token;
  localStorage.setItem('token', r.token);
  S.me = r.user;
  ['#loginForm', '#regEmailForm', '#regForm2'].forEach((s) => $(s).reset());
  S.reg.email = '';
  boot();
}

function logout(expired, msg) {
  localStorage.removeItem('token');
  S.token = null;
  if (S.socket) S.socket.disconnect();
  S.socket = null;
  if (S.rec) stopRec(true);
  Object.assign(S, { me: null, users: new Map(), online: new Set(), chats: new Map(), activeId: null, msgs: [], ctx: null, typing: new Map(), pushed: false });
  [...S.modals].forEach((m) => m.close());
  closePopup();
  $('#app').classList.add('hidden');
  $('#app').classList.remove('chat-open');
  $('#chatView').classList.add('hidden');
  $('#emptyState').classList.remove('hidden');
  document.title = S.cfg.app_name;
  setAuthView('login');
  $('#auth').classList.remove('hidden');
  authErr(msg || (expired ? 'نشست شما پایان یافته است، دوباره وارد شوید.' : ''));
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
    if (u && last_seen) u.last_seen = last_seen;
    refreshPresence();
  });

  s.on('user:new', ({ user }) => S.users.set(user.id, user));
  s.on('user:update', ({ user }) => {
    S.users.set(user.id, { ...(userOf(user.id) || {}), ...user });
    if (S.me && user.id === S.me.id) Object.assign(S.me, user);
    for (const c of S.chats.values()) if (c.type === 'dm' && c.peer.id === user.id) c.peer = { ...c.peer, ...user };
    renderChatList(); renderOnline();
    if (S.activeId) { renderHead(); renderAllMessages('keep'); }
  });
  s.on('user:delete', ({ id }) => {
    S.users.delete(id);
    for (const [cid, c] of S.chats) if (c.type === 'dm' && c.peer.id === id) { S.chats.delete(cid); if (S.activeId === cid) closeChat(true); }
    renderChatList(); renderOnline();
  });

  s.on('chat:new', ({ chat }) => { S.chats.set(chat.id, { ...(S.chats.get(chat.id) || {}), ...chat }); renderChatList(); });
  s.on('chat:update', ({ chat }) => {
    const c = S.chats.get(chat.id);
    if (c) Object.assign(c, chat);
    renderChatList();
    if (S.activeId === chat.id) { renderHead(); syncComposerState(); }
  });
  s.on('chat:delete', ({ id }) => { S.chats.delete(id); if (S.activeId === id) closeChat(true); renderChatList(); });

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
}

async function resync() {
  try {
    await loadChats();
    if (S.activeId) {
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

const chatTitle = (c) => (c.type === 'dm' ? (userOf(c.peer.id) || c.peer).display_name : c.title);
const peerOf = (c) => userOf(c.peer.id) || c.peer;

function typingText(c) {
  const map = S.typing.get(c.id);
  if (!map || !map.size) return '';
  if (c.type === 'dm') return 'در حال نوشتن…';
  const names = [...map.keys()].map((id) => (userOf(id) || {}).display_name).filter(Boolean);
  return names.length ? `${names.join('، ')} در حال نوشتن…` : '';
}

function lastPreview(c) {
  const l = c.last;
  if (!l) return '<span>بدون پیام</span>';
  let pre = '';
  if (l.sender_id === S.me.id) pre = 'شما: ';
  else if (c.type === 'group') pre = ((userOf(l.sender_id) || {}).display_name || l.sender_name || 'حساب حذف‌شده') + ': ';
  return esc(pre + preview(l));
}

function chatItem(c) {
  const dm = c.type === 'dm';
  const peer = dm ? peerOf(c) : null;
  const av = dm ? avatar(peer, 52, { dot: S.online.has(peer.id) }) : avatar({ id: c.id, display_name: c.title }, 52);
  const typing = typingText(c);
  const time = c.last ? listTime(c.last.created_at) : '';
  return `<div class="ci${c.id === S.activeId ? ' on' : ''}" data-chat="${c.id}">${av}
    <div class="ci-main">
      <div class="ci-row"><span class="ci-title">${esc(chatTitle(c))}${!dm && c.closed ? ' 🔒' : ''}</span><span class="ci-time">${time}</span></div>
      <div class="ci-row"><span class="ci-sub${typing ? ' typing' : ''}">${typing ? esc(typing) : lastPreview(c)}</span>${c.unread ? `<span class="badge">${fnum(c.unread)}</span>` : ''}</div>
    </div></div>`;
}

const badges = (u) => (u.role === 'owner' ? '<span class="tag">مالک</span>' : '') + (u.banned ? '<span class="tag bad">مسدود</span>' : '');

function userItem(u) {
  return `<div class="ci" data-uid="${u.id}">${avatar(u, 46, { dot: S.online.has(u.id) })}
    <div class="ci-main"><div class="ci-title">${esc(u.display_name)}${badges(u)}</div>
    <div class="ci-sub">@${esc(u.username)}</div></div></div>`;
}

function renderChatList() {
  if (!S.me) return;
  const q = $('#search').value.trim().toLowerCase();
  const chats = [...S.chats.values()].filter((c) => c.type === 'group' || c.last || c.id === S.activeId);
  chats.sort((a, b) => ((b.last && b.last.created_at) || b.created_at) - ((a.last && a.last.created_at) || a.created_at));

  const match = (c) => chatTitle(c).toLowerCase().includes(q) || (c.type === 'dm' && peerOf(c).username.includes(q));
  let html = (q ? chats.filter(match) : chats).map(chatItem).join('');

  if (q) {
    const have = new Set([...S.chats.values()].filter((c) => c.type === 'dm').map((c) => c.peer.id));
    const users = [...S.users.values()].filter((u) => u.id !== S.me.id && visibleUser(u) && !have.has(u.id) && (u.display_name.toLowerCase().includes(q) || u.username.includes(q)));
    if (users.length) html += '<div class="sec">کاربران</div>' + users.map(userItem).join('');
  }
  $('#chatList').innerHTML = html || `<div class="empty-list">${q ? 'نتیجه‌ای پیدا نشد' : 'هنوز گفتگویی ندارید.<br>از منو، بخش «کاربران» را باز کنید و گفتگو شروع کنید.'}</div>`;
}

function renderOnline() {
  if (!S.me) return;
  const list = [...S.online].filter((id) => id !== S.me.id).map(userOf).filter((u) => u && visibleUser(u));
  const el = $('#onlineStrip');
  el.classList.toggle('hidden', !list.length);
  el.innerHTML = list.map((u) => `<div class="os-item" data-uid="${u.id}">${avatar(u, 52, { dot: true })}<span>${esc(u.display_name.split(' ')[0])}</span></div>`).join('');
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
    [...S.modals].forEach((m) => m.close());
    $('#search').value = '';
    openChat(id);
  } catch (e) { toast(e.message, 'err'); }
}

/* =====================================================================
   CHAT VIEW
   ===================================================================== */
function statusText(c) {
  const t = typingText(c);
  if (t) return { text: t, on: true };
  if (c.type === 'dm') { const p = peerOf(c); return { text: seenText(p), on: S.online.has(p.id) }; }
  const n = S.online.size;
  return { text: `گروه${c.closed ? ' · بسته' : ''}${c.description ? ' · ' + c.description : ` · ${fnum(n)} نفر آنلاین`}`, on: false };
}

function seenText(u) {
  if (S.online.has(u.id)) return 'آنلاین';
  if (!u.last_seen) return 'آخرین بازدید: اخیراً';
  if (Date.now() - u.last_seen < 60000) return 'آخرین بازدید: همین الان';
  const n = daysAgo(u.last_seen);
  return 'آخرین بازدید: ' + (n === 0 ? 'امروز ' + tf.format(u.last_seen) : n === 1 ? 'دیروز ' + tf.format(u.last_seen) : df.format(u.last_seen));
}

function renderHead() {
  const c = S.chats.get(S.activeId);
  if (!c) return;
  const dm = c.type === 'dm';
  $('#headAv').innerHTML = dm ? avatar(peerOf(c), 42) : avatar({ id: c.id, display_name: c.title }, 42);
  $('#headTitle').textContent = chatTitle(c);
  refreshStatus();
  $('#btnChatMenu').classList.toggle('hidden', !(isOwner() && !dm));
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
  const closed = c ? isClosed(c) : false;
  $('#composer').classList.toggle('hidden', closed);
  $('#closedNote').classList.toggle('hidden', !closed);
  if (closed && S.ctx) clearCtx();
}

async function openChat(id) {
  if (S.rec) stopRec(true);
  S.activeId = id; S.ctx = null; S.msgs = []; S.hasMore = false; S.newCount = 0; S.stick = true;
  if (isMobile() && !S.pushed) { history.pushState({ chat: 1 }, ''); S.pushed = true; }
  $('#app').classList.add('chat-open');
  $('#emptyState').classList.add('hidden');
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
  if (!isMobile()) $('#input').focus();
}

function closeChat(fromPop) {
  if (!fromPop && S.pushed) { history.back(); return; }
  S.pushed = false;
  if (S.rec) stopRec(true);
  S.activeId = null; S.msgs = []; S.ctx = null;
  $('#app').classList.remove('chat-open');
  $('#chatView').classList.add('hidden');
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
  if (!c) { // a brand-new private chat: the server list already includes this message
    try { await loadChats(); } catch { /* ignore */ }
    return;
  }
  c.last = { id: m.id, type: m.type, text: m.text, created_at: m.created_at, sender_id: m.sender ? m.sender.id : null, sender_name: m.sender ? m.sender.display_name : null };
  const mine = !!m.sender && m.sender.id === S.me.id;
  if (S.activeId === m.chat_id) {
    const had = S.msgs.some((x) => x.id === m.id);
    addMessage(m, mine);
    if (!mine && !had) document.visibilityState === 'visible' ? markRead() : (c.unread = (c.unread || 0) + 1);
  } else if (!mine) {
    c.unread = (c.unread || 0) + 1;
  }
  renderChatList(); updateTitle();
}

/* ---------- messages: rendering ---------- */
const dayHTML = (ts) => `<div class="day"><span>${dayLabel(ts)}</span></div>`;

function ticksHTML(m) {
  const c = S.chats.get(m.chat_id);
  if (!c || !m.sender || m.sender.id !== S.me.id) return '';
  const seen = c.type === 'dm' && (c.peer_read || 0) >= m.id;
  return `<span class="ticks${seen ? ' seen' : ''}" data-tid="${m.id}">${ic(seen ? 'checks' : 'check', 16)}</span>`;
}

function refreshTicks() {
  $$('.ticks').forEach((el) => {
    const m = S.msgs.find((x) => x.id === +el.dataset.tid);
    if (m) el.outerHTML = ticksHTML(m);
  });
}

function mediaHTML(m) {
  const f = m.file;
  if (!f) return '';
  const url = esc(f.url);
  if (m.type === 'image') return `<img class="media-el" src="${url}" alt="" loading="lazy" data-lb="${url}">`;
  if (m.type === 'video') return `<video class="media-el" src="${url}" controls preload="metadata" playsinline></video>`;
  if (m.type === 'voice') {
    return `<div class="voice"><button class="vplay" type="button" data-vplay aria-label="پخش">${ic('play', 18)}</button>
      <div class="vbar" data-vbar><div class="vfill"></div></div><span class="vtime">${fdur(f.duration || 0)}</span>
      <audio preload="metadata" src="${url}" data-dur="${f.duration || 0}"></audio></div>`;
  }
  return `<a class="file" href="${url}" download="${esc(f.name || 'file')}" target="_blank" rel="noopener"><span class="fi">${ic('file', 22)}</span>
    <span><b>${esc(f.name || 'فایل')}</b><small>${fsize(f.size || 0)}</small></span></a>`;
}

function msgHTML(m, prev) {
  const mine = m.sender && m.sender.id === S.me.id;
  const c = S.chats.get(m.chat_id);
  const group = c && c.type === 'group';
  const s = senderOf(m);
  const first = !prev || (prev.sender && prev.sender.id) !== (m.sender && m.sender.id) || dayKey(prev.created_at) !== dayKey(m.created_at);
  const name = s ? s.display_name : 'حساب حذف‌شده';
  const color = COLORS[((s && s.id) || 0) % COLORS.length];

  const slot = group && !mine ? `<div class="av-slot">${first && s ? `<span data-user="${s.id}" style="cursor:pointer">${avatar(s, 34)}</span>` : ''}</div>` : '';
  const head = group && !mine && first ? `<div class="sname" data-user="${s ? s.id : ''}" style="color:${color}">${esc(name)}</div>` : '';
  const reply = m.reply ? `<div class="reply" data-goto="${m.reply.id}"><b>${esc(m.reply.name || 'حساب حذف‌شده')}</b><span>${esc(preview(m.reply))}</span></div>` : '';
  const text = m.text ? `<div class="text" dir="auto">${linkify(m.text)}</div>` : '';
  const reacts = m.reactions.length
    ? `<div class="reacts">${m.reactions.map((r) => `<button class="react${r.users.includes(S.me.id) ? ' me' : ''}" type="button" data-react="${esc(r.emoji)}" title="${esc(r.users.map((id) => (userOf(id) || {}).display_name || '').filter(Boolean).join('، '))}">${esc(r.emoji)} <b>${fnum(r.users.length)}</b></button>`).join('')}</div>`
    : '';
  const media = m.file && (m.type === 'image' || m.type === 'video');

  return `<div class="row ${mine ? 'mine' : 'theirs'}" id="m-${m.id}" data-id="${m.id}">${slot}
    <div class="bubble${media ? ' media' : ''}">
      <button class="more" type="button" data-more aria-label="گزینه‌ها">${ic('down', 16)}</button>
      ${head}${reply}${mediaHTML(m)}${text}${reacts}
      <div class="meta">${m.edited_at ? '<span>ویرایش‌شده</span>' : ''}<span>${tf.format(m.created_at)}</span>${ticksHTML(m)}</div>
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
  if (mode === 'bottom') scrollBottom();
  else if (mode === 'keepTop') sc.scrollTop = prevT + (sc.scrollHeight - prevH);
  else sc.scrollTop = sc.scrollHeight - (prevH - prevT); // keep distance from bottom
}

function scrollBottom() {
  const sc = $('#msgScroll');
  sc.scrollTop = sc.scrollHeight;
  requestAnimationFrame(() => { sc.scrollTop = sc.scrollHeight; });
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
  if (mine || S.stick) scrollBottom();
  else { S.newCount++; $('#jumpBadge').textContent = fnum(S.newCount); $('#jumpBadge').classList.remove('hidden'); $('#jumpDown').classList.remove('hidden'); }
}

function updateMessage(m) {
  const i = S.msgs.findIndex((x) => x.id === m.id);
  if (i < 0) return;
  S.msgs[i] = m;
  const el = $('#m-' + m.id);
  if (!el) return;
  const t = document.createElement('template');
  t.innerHTML = msgHTML(m, S.msgs[i - 1]).trim();
  el.replaceWith(t.content.firstElementChild);
}

function removeMessage(chatId, id) {
  const c = S.chats.get(chatId);
  if (chatId === S.activeId) {
    S.msgs = S.msgs.filter((m) => m.id !== id);
    S.msgs.forEach((m) => { if (m.reply && m.reply.id === id) m.reply = null; });
    if (S.ctx && S.ctx.msg.id === id) clearCtx();
    renderAllMessages('keep');
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
  if (!el) { toast('پیام اصلی در بخش بالاتر گفتگو است'); return; }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1400);
}

/* =====================================================================
   COMPOSER
   ===================================================================== */
function autosize() {
  const t = $('#input');
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 140) + 'px';
  t.dir = t.value ? 'auto' : 'rtl';
}

function syncSend() {
  const has = $('#input').value.trim().length > 0 || (S.ctx && S.ctx.type === 'edit');
  const b = $('#btnSend');
  b.dataset.mode = has ? 'send' : 'mic';
  b.innerHTML = ic(has ? 'send' : 'mic');
  b.setAttribute('aria-label', has ? 'ارسال' : 'ضبط پیام صوتی');
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
  S.ctx = null;
  renderCtx();
  if (wasEdit) resetInput();
}

function renderCtx() {
  const b = $('#ctxBar');
  if (!S.ctx) { b.classList.add('hidden'); b.innerHTML = ''; return; }
  const { type, msg } = S.ctx;
  const s = senderOf(msg);
  b.classList.remove('hidden');
  b.innerHTML = `${ic(type === 'edit' ? 'edit' : 'reply', 20)}<div class="cx-main"><b>${type === 'edit' ? 'ویرایش پیام' : 'پاسخ به ' + esc(s ? s.display_name : 'حساب حذف‌شده')}</b><span>${esc(preview(msg))}</span></div><button class="icon-btn" type="button" data-cx-close aria-label="لغو">${ic('x', 20)}</button>`;
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
  } catch (e) {
    toast(e.message, 'err');
    ta.value = text; autosize(); syncSend();
  }
}

function setProgress(p) {
  $('#upbar').classList.toggle('hidden', p === null);
  if (p !== null) $('#upbar i').style.width = Math.round(p * 100) + '%';
}

async function sendFiles(files, { duration, chatId = S.activeId } = {}) {
  const c = S.chats.get(chatId);
  if (!c || !files.length) return;
  if (isClosed(c)) { toast('این گروه بسته است', 'err'); return; }
  const max = S.cfg.max_upload_mb * 1048576;
  let first = true;
  for (const f of files) {
    if (!f.size) continue;
    if (f.size > max) { toast(`حجم «${f.name}» بیشتر از ${fnum(S.cfg.max_upload_mb)} مگابایت است`, 'err'); continue; }
    const fd = new FormData();
    fd.append('file_name', f.name);
    if (duration) fd.append('duration', duration);
    const active = S.activeId === chatId;
    if (first && active) {
      const t = $('#input').value.trim();
      if (t && !(S.ctx && S.ctx.type === 'edit')) fd.append('text', t);
      if (S.ctx && S.ctx.type === 'reply') fd.append('reply_to', S.ctx.msg.id);
    }
    fd.append('file', f);
    try {
      setProgress(0);
      const r = await uploadForm(`/chats/${chatId}/messages`, fd, setProgress);
      if (first && active && !(S.ctx && S.ctx.type === 'edit')) { resetInput(); clearCtx(); }
      first = false;
      onNewMessage({ message: r.message });
    } catch (e) { toast(e.message, 'err'); break; } finally { setProgress(null); }
  }
}

/* ---------- voice recording ---------- */
async function startRec() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { toast('مرورگر شما از ضبط صدا پشتیبانی نمی‌کند', 'err'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast('دسترسی به میکروفون داده نشد', 'err'); return; }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const R = (S.rec = { rec, chunks, start: Date.now(), cancel: false, chatId: S.activeId });
  R.timer = setInterval(() => { $('#recTime').textContent = fdur((Date.now() - R.start) / 1000); }, 250);
  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    clearInterval(R.timer);
    if (S.rec === R) S.rec = null;
    $('#recBar').classList.add('hidden');
    syncComposerState();
    if (R.cancel) return;
    const dur = Math.round((Date.now() - R.start) / 1000);
    if (dur < 1) return;
    const type = rec.mimeType || mime || 'audio/webm';
    sendFiles([new File([new Blob(chunks, { type })], 'voice', { type })], { duration: dur, chatId: R.chatId });
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
   POPUPS, MODALS, DIALOGS
   ===================================================================== */
function popup(html, x, y, handler, { right = false } = {}) {
  const m = $('#menu');
  m.innerHTML = html;
  m.classList.remove('hidden');
  m.style.left = '0px'; m.style.top = '0px';
  const w = m.offsetWidth, h = m.offsetHeight;
  const left = right ? x - w : x;
  m.style.left = Math.max(8, Math.min(left, innerWidth - w - 8)) + 'px';
  m.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
  S.popupHandler = handler;
  S.popupAt = Date.now();
}

function closePopup() { $('#menu').classList.add('hidden'); S.popupHandler = null; }

function openModal(html, { small = false, onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal${small ? ' small' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  $('#modals').append(back);
  const modal = {
    el: back.firstElementChild,
    close() {
      if (!back.isConnected) return;
      back.remove();
      S.modals = S.modals.filter((x) => x !== modal);
      if (onClose) onClose();
    },
  };
  let down = false;
  back.addEventListener('mousedown', (e) => { down = e.target === back; });
  back.addEventListener('click', (e) => {
    if ((down && e.target === back) || e.target.closest('[data-close]')) modal.close();
  });
  S.modals.push(modal);
  return modal;
}

const mHead = (title) => `<div class="m-head"><span>${esc(title)}</span><button class="icon-btn" type="button" data-close aria-label="بستن">${ic('x', 20)}</button></div>`;

function confirmBox(text, ok = 'تأیید', danger = false) {
  return new Promise((resolve) => {
    const m = openModal(`<div class="m-body"><p class="m-text">${esc(text)}</p></div>
      <div class="m-actions"><button class="btn${danger ? ' danger' : ''}" type="button" data-ok>${esc(ok)}</button><button class="btn ghost" type="button" data-close>انصراف</button></div>`,
      { small: true, onClose: () => resolve(false) });
    $('[data-ok]', m.el).onclick = () => { resolve(true); m.close(); };
  });
}

/* ---------- message menu ---------- */
function openMsgMenu(id, x, y) {
  const m = S.msgs.find((z) => z.id === id);
  const c = m && S.chats.get(m.chat_id);
  if (!m || !c) return;
  const mine = m.sender && m.sender.id === S.me.id;
  const canWrite = !isClosed(c);
  const canDel = mine || (isOwner() && c.type === 'group');

  let h = `<div class="rx">${REACTIONS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div><div class="sep"></div>`;
  if (canWrite) h += `<button type="button" data-act="reply">${ic('reply', 18)}پاسخ</button>`;
  if (m.text) h += `<button type="button" data-act="copy">${ic('copy', 18)}کپی متن</button>`;
  if (mine && canWrite) h += `<button type="button" data-act="edit">${ic('edit', 18)}ویرایش</button>`;
  if (canDel) h += `<button type="button" class="danger" data-act="del">${ic('trash', 18)}حذف</button>`;

  popup(h, x, y, async (d) => {
    if (d.emoji) return react(m.id, d.emoji);
    if (d.act === 'reply') setCtx('reply', m);
    if (d.act === 'edit') setCtx('edit', m);
    if (d.act === 'copy') {
      try { await navigator.clipboard.writeText(m.text); toast('کپی شد'); } catch { toast('کپی ناموفق بود', 'err'); }
    }
    if (d.act === 'del' && (await confirmBox('این پیام حذف شود؟', 'حذف', true))) {
      try { await api('/messages/' + m.id, { method: 'DELETE' }); removeMessage(m.chat_id, m.id); } catch (e) { toast(e.message, 'err'); }
    }
  });
}

async function react(messageId, emoji) {
  try {
    const r = await api(`/messages/${messageId}/reaction`, { method: 'PUT', body: { emoji } });
    const m = S.msgs.find((x) => x.id === messageId);
    if (m) { m.reactions = r.reactions; updateMessage(m); }
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------- users / profiles ---------- */
function openUsers() {
  const m = openModal(`${mHead('کاربران')}<div class="m-body"><input class="inp" id="uSearch" type="search" placeholder="جستجوی کاربر…" autocomplete="off"><div class="ulist" id="uList"></div></div>`);
  const draw = () => {
    const q = $('#uSearch', m.el).value.trim().toLowerCase();
    const list = [...S.users.values()]
      .filter((u) => visibleUser(u) && (!q || u.display_name.toLowerCase().includes(q) || u.username.includes(q)))
      .sort((a, b) => (S.online.has(b.id) - S.online.has(a.id)) || a.display_name.localeCompare(b.display_name, 'fa'));
    $('#uList', m.el).innerHTML = list.map((u) => `<div class="ci" data-profile="${u.id}">${avatar(u, 46, { dot: S.online.has(u.id) })}
      <div class="ci-main"><div class="ci-title">${esc(u.display_name)}${badges(u)}</div>
      <div class="ci-sub">@${esc(u.username)} · ${esc(seenText(u))}</div></div></div>`).join('') || '<div class="empty-list">کاربری پیدا نشد</div>';
  };
  $('#uSearch', m.el).oninput = draw;
  $('#uList', m.el).onclick = (e) => { const r = e.target.closest('[data-profile]'); if (r) { m.close(); openProfile(+r.dataset.profile); } };
  draw();
}

function openProfile(uid) {
  const u = userOf(uid);
  if (!u) return;
  if (S.me && u.id === S.me.id) return openMyProfile();
  const m = openModal(`${mHead('پروفایل')}
    <div class="prof">${avatar(u, 96)}<h2>${esc(u.display_name)}${badges(u)}</h2>
      <div class="muted" dir="ltr">@${esc(u.username)}</div>
      <div class="status${S.online.has(u.id) ? ' on' : ''}">${esc(seenText(u))}</div>
      ${u.bio ? `<p class="bio" dir="auto">${esc(u.bio)}</p>` : ''}</div>
    <div class="m-actions col" style="padding-top:16px">
      ${u.banned ? '' : '<button class="btn" type="button" data-dm>ارسال پیام</button>'}
      ${isOwner() && u.role !== 'owner' ? `<button class="btn ghost ${u.banned ? '' : 'danger-t'}" type="button" data-ban>${u.banned ? 'رفع مسدودیت' : 'مسدود کردن کاربر'}</button>` : ''}
    </div>`);
  const dm = $('[data-dm]', m.el);
  if (dm) dm.onclick = () => { m.close(); openDM(u.id); };
  const ban = $('[data-ban]', m.el);
  if (ban) ban.onclick = async () => {
    const to = !u.banned;
    if (!(await confirmBox(to ? `«${u.display_name}» مسدود شود؟ دیگر نمی‌تواند وارد شود یا پیام بدهد.` : `مسدودیت «${u.display_name}» برداشته شود؟`, to ? 'مسدود کردن' : 'رفع مسدودیت', to))) return;
    try {
      const r = await api(`/users/${u.id}/ban`, { method: 'POST', body: { banned: to } });
      S.users.set(u.id, { ...u, ...r.user });
      m.close(); renderChatList(); renderOnline();
      toast(to ? 'کاربر مسدود شد' : 'مسدودیت برداشته شد');
    } catch (e) { toast(e.message, 'err'); }
  };
}

function resizeImage(file, max = 320) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('خطا در پردازش تصویر'))), 'image/jpeg', 0.88);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('این فایل تصویر معتبر نیست')); };
    img.src = url;
  });
}

function applyMe(u) {
  Object.assign(S.me, u);
  S.users.set(u.id, { ...(userOf(u.id) || {}), ...u });
}

function openMyProfile() {
  const me = S.me;
  const m = openModal(`${mHead('پروفایل من')}
    <div class="m-body stack">
      <div class="av-edit">${avatar(me, 96)}
        <div class="av-actions"><button class="btn small ghost" type="button" id="pPick">تغییر عکس</button>${me.avatar ? '<button class="btn small ghost danger-t" type="button" id="pDel">حذف عکس</button>' : ''}</div>
        <input type="file" id="pFile" accept="image/*" hidden></div>
      <label class="field"><span>نام نمایشی</span><input class="inp" id="pName" maxlength="40" value="${esc(me.display_name)}"></label>
      <label class="field"><span>بیوگرافی</span><textarea class="inp" id="pBio" maxlength="160" rows="3">${esc(me.bio)}</textarea></label>
      <div class="kv"><span>آیدی</span><b dir="ltr">@${esc(me.username)}</b></div>
      <div class="kv"><span>ایمیل</span><b dir="ltr">${esc(me.email)}</b></div>
    </div>
    <div class="m-actions"><button class="btn" type="button" id="pSave">ذخیره</button><button class="btn ghost" type="button" data-close>بستن</button>
      ${me.role === 'owner' ? '' : '<button class="btn ghost danger-t push" type="button" id="pAcc">حذف حساب</button>'}</div>`);

  const reopen = () => { m.close(); openMyProfile(); };
  $('#pPick', m.el).onclick = () => $('#pFile', m.el).click();
  $('#pFile', m.el).onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const fd = new FormData();
      fd.append('file', await resizeImage(f), 'avatar.jpg');
      const r = await fetch('/api/me/avatar', { method: 'POST', headers: { Authorization: 'Bearer ' + S.token }, body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'آپلود عکس ناموفق بود');
      applyMe(d); renderChatList(); reopen();
    } catch (err) { toast(err.message, 'err'); }
  };
  const del = $('#pDel', m.el);
  if (del) del.onclick = async () => { try { applyMe(await api('/me/avatar', { method: 'DELETE' })); renderChatList(); reopen(); } catch (e) { toast(e.message, 'err'); } };
  $('#pSave', m.el).onclick = async () => {
    try {
      applyMe(await api('/me', { method: 'PATCH', body: { display_name: $('#pName', m.el).value, bio: $('#pBio', m.el).value } }));
      toast('ذخیره شد'); m.close(); renderChatList();
    } catch (e) { toast(e.message, 'err'); }
  };
  const acc = $('#pAcc', m.el);
  if (acc) acc.onclick = () => { m.close(); openDeleteAccount(); };
}

function openDeleteAccount() {
  const m = openModal(`${mHead('حذف حساب')}
    <div class="m-body stack"><p class="m-text">با حذف حساب، گفتگوهای خصوصی شما برای همیشه پاک می‌شود. پیام‌های شما در گروه‌ها با نام «حساب حذف‌شده» باقی می‌ماند. این کار قابل بازگشت نیست.</p>
    <label class="field"><span>برای تأیید، رمز عبور را وارد کنید</span><input class="inp" id="dPass" type="password" autocomplete="current-password" dir="ltr"></label></div>
    <div class="m-actions"><button class="btn danger" type="button" id="dGo">حذف حساب</button><button class="btn ghost" type="button" data-close>انصراف</button></div>`);
  $('#dGo', m.el).onclick = async () => {
    try {
      await api('/me', { method: 'DELETE', body: { password: $('#dPass', m.el).value } });
      logout(false, 'حساب شما حذف شد.');
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* ---------- groups (owner) ---------- */
function openGroupForm(c) {
  const edit = !!c;
  const m = openModal(`${mHead(edit ? 'تنظیمات گروه' : 'گروه جدید')}
    <div class="m-body stack">
      <label class="field"><span>نام گروه</span><input class="inp" id="gTitle" maxlength="60" value="${esc(edit ? c.title : '')}"></label>
      <label class="field"><span>توضیحات (اختیاری)</span><textarea class="inp" id="gDesc" maxlength="200" rows="3">${esc(edit ? c.description : '')}</textarea></label>
      ${edit ? `<label class="switch"><input type="checkbox" id="gClosed" ${c.closed ? 'checked' : ''}><span>بستن گروه (فقط مالک می‌تواند پیام بدهد)</span></label>` : ''}
    </div>
    <div class="m-actions"><button class="btn" type="button" id="gSave">${edit ? 'ذخیره' : 'ساخت گروه'}</button><button class="btn ghost" type="button" data-close>انصراف</button>
      ${edit ? '<button class="btn ghost danger-t push" type="button" id="gDel">حذف گروه</button>' : ''}</div>`);
  $('#gTitle', m.el).focus();

  $('#gSave', m.el).onclick = async () => {
    const title = $('#gTitle', m.el).value, description = $('#gDesc', m.el).value;
    try {
      if (edit) {
        const r = await api('/chats/' + c.id, { method: 'PATCH', body: { title, description, closed: $('#gClosed', m.el).checked } });
        Object.assign(c, r.chat);
        renderChatList(); renderHead(); syncComposerState();
        m.close();
      } else {
        const r = await api('/chats/group', { method: 'POST', body: { title, description } });
        S.chats.set(r.chat.id, r.chat);
        m.close(); openChat(r.chat.id);
      }
    } catch (e) { toast(e.message, 'err'); }
  };
  const del = $('#gDel', m.el);
  if (del) del.onclick = async () => {
    if (!(await confirmBox(`گروه «${c.title}» و همه پیام‌هایش برای همیشه حذف شود؟`, 'حذف گروه', true))) return;
    try { await api('/chats/' + c.id, { method: 'DELETE' }); m.close(); } catch (e) { toast(e.message, 'err'); }
  };
}

/* =====================================================================
   BOOT & EVENT BINDING
   ===================================================================== */
function showApp() {
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
}

async function boot() {
  showApp();
  try {
    const [u, c] = await Promise.all([api('/users'), api('/chats')]);
    S.users = new Map(u.users.map((x) => [x.id, x]));
    S.users.set(S.me.id, { ...(userOf(S.me.id) || {}), ...S.me });
    S.chats = new Map(c.chats.map((x) => [x.id, x]));
    connectSocket();
    renderChatList(); renderOnline(); updateTitle();
  } catch (e) { if (S.token) toast(e.message, 'err'); }
}

function bindStatic() {
  $('#logo').innerHTML = ic('send', 34);
  $('#btnMenu').innerHTML = ic('menu');
  $('#btnBack').innerHTML = ic('back');
  $('#btnChatMenu').innerHTML = ic('dots');
  $('#btnAttach').innerHTML = ic('clip');
  $('#recCancel').innerHTML = ic('trash');
  $('#recSend').innerHTML = ic('send');
  $('#jumpDown').insertAdjacentHTML('afterbegin', ic('down'));
  applyTheme(document.documentElement.dataset.theme);
  $('#themeAuth').onclick = toggleTheme;
  syncSend();

  /* sidebar */
  $('#search').oninput = renderChatList;
  $('#btnMenu').onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dark = document.documentElement.dataset.theme === 'dark';
    popup(`<div class="pm-head">${avatar(S.me, 40)}<div><b>${esc(S.me.display_name)}</b><span class="muted" dir="ltr">@${esc(S.me.username)}</span></div></div><div class="sep"></div>
      <button type="button" data-act="profile">${ic('user', 18)}پروفایل من</button>
      <button type="button" data-act="users">${ic('users', 18)}کاربران</button>
      ${isOwner() ? `<button type="button" data-act="group">${ic('plus', 18)}گروه جدید</button>` : ''}
      <button type="button" data-act="theme">${ic(dark ? 'sun' : 'moon', 18)}${dark ? 'حالت روز' : 'حالت شب'}</button>
      <div class="sep"></div><button type="button" class="danger" data-act="logout">${ic('logout', 18)}خروج از حساب</button>`,
      r.right, r.bottom + 6, (d) => {
        if (d.act === 'profile') openMyProfile();
        if (d.act === 'users') openUsers();
        if (d.act === 'group') openGroupForm();
        if (d.act === 'theme') toggleTheme();
        if (d.act === 'logout') logout(false);
      }, { right: true });
  };

  $('#chatList').onclick = (e) => {
    const chat = e.target.closest('[data-chat]');
    if (chat) return openChat(+chat.dataset.chat);
    const u = e.target.closest('[data-uid]');
    if (u) openDM(+u.dataset.uid);
  };
  $('#onlineStrip').onclick = (e) => { const u = e.target.closest('[data-uid]'); if (u) openDM(+u.dataset.uid); };

  /* chat header */
  $('#btnBack').onclick = () => closeChat(false);
  $('#headInfo').onclick = () => { const c = S.chats.get(S.activeId); if (c && c.type === 'dm') openProfile(c.peer.id); };
  $('#btnChatMenu').onclick = () => { const c = S.chats.get(S.activeId); if (c) openGroupForm(c); };
  window.addEventListener('popstate', () => { if (S.activeId) closeChat(true); });

  /* messages */
  const list = $('#msgList'), sc = $('#msgScroll');
  sc.addEventListener('scroll', () => {
    S.stick = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 140;
    if (S.stick) { S.newCount = 0; $('#jumpDown').classList.add('hidden'); markRead(); }
    else $('#jumpDown').classList.remove('hidden');
    if (sc.scrollTop < 120) loadOlder();
  });
  $('#jumpDown').onclick = scrollBottom;
  list.addEventListener('load', () => { if (S.stick) sc.scrollTop = sc.scrollHeight; }, true);
  list.addEventListener('loadedmetadata', () => { if (S.stick) sc.scrollTop = sc.scrollHeight; }, true);

  list.addEventListener('click', (e) => {
    if (S.suppressClick) { S.suppressClick = false; return; }
    const t = e.target;
    const row = t.closest('.row');
    const more = t.closest('[data-more]');
    if (more && row) { const r = more.getBoundingClientRect(); return openMsgMenu(+row.dataset.id, r.left, r.bottom + 4); }
    const re = t.closest('[data-react]');
    if (re && row) return react(+row.dataset.id, re.dataset.react);
    const g = t.closest('[data-goto]');
    if (g) return gotoMessage(+g.dataset.goto);
    const lb = t.closest('[data-lb]');
    if (lb) { $('#lbImg').src = lb.dataset.lb; $('#lightbox').classList.remove('hidden'); return; }
    const vp = t.closest('[data-vplay]');
    if (vp) { const a = $('audio', vp.parentElement); return a.paused ? (pauseAllAudio(), a.play().catch(() => toast('پخش صدا ممکن نیست', 'err'))) : a.pause(); }
    const vb = t.closest('[data-vbar]');
    if (vb) {
      const a = $('audio', vb.parentElement), r = vb.getBoundingClientRect();
      if (a.duration && isFinite(a.duration)) a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
      return;
    }
    const us = t.closest('[data-user]');
    if (us && us.dataset.user) openProfile(+us.dataset.user);
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

  /* voice player (media events don't bubble → capture) */
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
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); submitComposer(); }
  });
  ta.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData ? e.clipboardData.files : [])];
    if (files.length) { e.preventDefault(); sendFiles(files); }
  });
  $('#btnSend').onclick = () => ($('#btnSend').dataset.mode === 'send' ? submitComposer() : startRec());
  $('#composer').onsubmit = (e) => e.preventDefault();
  $('#btnAttach').onclick = () => $('#fileInput').click();
  $('#fileInput').onchange = (e) => { const files = [...e.target.files]; e.target.value = ''; sendFiles(files); };
  $('#ctxBar').onclick = (e) => { if (e.target.closest('[data-cx-close]')) clearCtx(); };
  $('#recCancel').onclick = () => stopRec(true);
  $('#recSend').onclick = () => stopRec(false);

  const pane = $('#chatPane');
  pane.addEventListener('dragover', (e) => { if (S.activeId) e.preventDefault(); });
  pane.addEventListener('drop', (e) => {
    if (!S.activeId || !e.dataTransfer.files.length) return;
    e.preventDefault();
    sendFiles([...e.dataTransfer.files]);
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
  window.addEventListener('resize', closePopup);
  $('#lightbox').onclick = () => { $('#lightbox').classList.add('hidden'); $('#lbImg').removeAttribute('src'); };
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#lightbox').classList.contains('hidden')) return $('#lightbox').click();
    if (!$('#menu').classList.contains('hidden')) return closePopup();
    if (S.modals.length) return S.modals[S.modals.length - 1].close();
    if (S.ctx) return clearCtx();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.activeId) markRead(); });
}

function pauseAllAudio() { $$('audio').forEach((a) => a.pause()); }

async function init() {
  try { S.cfg = await (await fetch('/api/config')).json(); } catch { /* defaults */ }
  document.title = S.cfg.app_name;
  $$('.brand-name').forEach((e) => (e.textContent = S.cfg.app_name));
  bindStatic();
  initAuth();
  if (S.token) {
    try { S.me = await api('/me'); await boot(); return; } catch (e) { if (S.token) toast(e.message, 'err'); }
  }
  setAuthView('login');
  $('#auth').classList.remove('hidden');
}

init();
