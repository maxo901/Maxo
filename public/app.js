'use strict';
/* =====================================================================
   app.js — auth, boot, realtime, chat list, chat view, composer
   (panels live in panels.js)
   ===================================================================== */

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👎'];
const EMOJI_SETS = {
  '😀': '😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 😉 😍 🥰 😘 😋 😜 🤪 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 😶 😐 😑 😬 🙄 😯 😪 😴 🤤 😷 🤒 🤕 🤢 🤮 🥴 😵 🤠 🥸 😈 💀 👻 👽 🤖 💩',
  '👍': '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐 🖖 👋 🤝 🙏 💪 👏 🙌 👐 🤲 ✍️ 🤳 💅 👀 👅 👄 🧠 🫶 🫡 🫰',
  '❤️': '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💋 💯 💢 💥 💫 💦 💨 🔥 ✨ ⭐ 🌟 ⚡ 🎉 🎊 🎁',
  '🐶': '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦆 🦉 🐺 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🐙 🐬 🐳 🦈 🌸 🌹 🌻 🌲 🍀 🌈 ☀️ 🌙 ⛄',
  '🍕': '🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥝 🍅 🥑 🌽 🥕 🍞 🧀 🍳 🥞 🍔 🍟 🍕 🌭 🌮 🍣 🍜 🍝 🍦 🍩 🍪 🎂 🍫 🍿 ☕ 🍵 🥤 🍺 🍷',
  '⚽': '⚽ 🏀 🏈 ⚾ 🎾 🏐 🎱 🏓 🥊 🎯 🎮 🎲 🎸 🎹 🎤 🎧 🎬 🚗 ✈️ 🚀 🏠 🏖 🗺 💻 📱 📷 💡 📚 ✏️ 💰 🎓 ⏰ 🔑 🔒',
};

const userOf = (id) => S.users.get(id);
const chatById = (id) => S.chats.find((c) => c.id === id);
const activeChat = () => chatById(S.activeId);
const canPostLocal = (c) => c.type === 'dm' || !((c.closed || c.kind === 'channel') && !c.can_manage);
const chatName = (c) => (c.type === 'group' ? c.title : c.saved ? t('saved') : c.peer?.display_name || '?');
function chatAv(c, size = 48, opt = {}) {
  if (c.saved) return avatar(null, size, { saved: true });
  if (c.type === 'group') return avatar(c, size);
  const u = userOf(c.peer.id) || c.peer;
  return avatar(u, size, { dot: S.online.has(u.id), ...opt });
}
const chatSortKey = (c) => (c.last ? c.last.created_at : c.created_at);
const sortChats = () => S.chats.sort((a, b) => chatSortKey(b) - chatSortKey(a));

function previewText(m) {
  if (!m) return '';
  if (m.type === 'image') return t('pv_photo') + (m.text ? ' ' + m.text : '');
  if (m.type === 'video') return t('pv_video') + (m.text ? ' ' + m.text : '');
  if (m.type === 'voice') return t('pv_voice');
  if (m.type === 'file') return t('pv_file') + (m.text ? ' ' + m.text : '');
  return m.text || '';
}

/* =====================================================================
   screens, language, auth
   ===================================================================== */
function showScreen(name) {
  $('#langPick').classList.toggle('hidden', name !== 'lang');
  $('#auth').classList.toggle('hidden', name !== 'auth');
  $('#app').classList.toggle('hidden', name !== 'app');
}

function setLanguage(code, { save = true } = {}) {
  setLang(code);
  localStorage.setItem('lang', code);
  S.set.lang = code;
  applyStaticI18n();
  $('#authLang').innerHTML = ic('globe', 16) + `<span>${esc(LANG_META().name)}</span>`;
  $('#appName').textContent = S.appName || t('app_name');
  fillChrome();
  if (S.me) {
    renderList(); renderStoryBar(); refreshPanels();
    if (S.activeId != null) { renderHead(); renderComposerState(); renderAllMessages(); }
  }
  if (save) saveSet({ lang: code });
}

function showLangPick() {
  return new Promise((resolve) => {
    const guess = (navigator.language || 'en').slice(0, 2).toLowerCase();
    const host = $('#langPick');
    host.innerHTML = `<div class="lang-card"><div class="logo">${ic('globe', 34)}</div>
      <h1>Choose language · انتخاب زبان</h1>
      <div class="lang-list">${LANGS.map((l, i) => `<button type="button" class="lang-item ${l.code === guess ? 'on' : ''}" data-l="${l.code}" style="animation-delay:${i * 45}ms"><span class="flag">${l.flag}</span><span>${esc(l.name)}</span></button>`).join('')}</div></div>`;
    showScreen('lang');
    host.onclick = (e) => {
      const b = e.target.closest('[data-l]');
      if (!b) return;
      $$('.lang-item', host).forEach((x) => x.classList.toggle('on', x === b));
      setTimeout(() => { setLanguage(b.dataset.l); host.onclick = null; resolve(); }, 220);
    };
  });
}

function fillChrome() {
  $('#searchIc').innerHTML = ic('search', 18);
  $('#btnMenu').innerHTML = ic('menu', 24);
  $('#fab').innerHTML = ic('edit', 24);
  $('#btnBack').innerHTML = backIc();
  $('#btnChatMenu').innerHTML = ic('dots', 22);
  $('#btnAttach').innerHTML = ic('clip', 24);
  $('#btnEmoji').innerHTML = ic('smile', 24);
  $('#ctxClose').innerHTML = ic('x', 20);
  $('#jump').firstElementChild.insertAdjacentHTML('beforebegin', '');
  $('#logo').innerHTML = ic('chat', 38);
  syncSendBtn();
}

function bindAuth() {
  const tabs = { login: $('#tabLogin'), reg: $('#tabReg') };
  const setTab = (k) => {
    tabs.login.classList.toggle('on', k === 'login'); tabs.reg.classList.toggle('on', k === 'reg');
    $('#formLogin').classList.toggle('hidden', k !== 'login'); $('#formReg').classList.toggle('hidden', k !== 'reg');
  };
  tabs.login.onclick = () => setTab('login'); tabs.reg.onclick = () => setTab('reg');
  $('#authLang').onclick = () => { showLangPick().then(() => showScreen('auth')); };

  let timer;
  $('#rgUser').addEventListener('input', (e) => {
    const hint = $('#rgUserHint'), v = e.target.value.trim().toLowerCase();
    clearTimeout(timer);
    if (!v) { hint.className = 'hint'; hint.textContent = t('auth.username_hint'); return; }
    if (!/^[a-z][a-z0-9_]{2,19}$/.test(v)) { hint.className = 'hint bad'; hint.textContent = t('auth.username_bad'); return; }
    timer = setTimeout(async () => {
      try {
        const d = await fetch('/api/auth/check-username?u=' + encodeURIComponent(v)).then((r) => r.json());
        hint.className = 'hint ' + (d.available ? 'good' : 'bad');
        hint.textContent = d.available ? t('auth.username_free') : t('auth.username_taken');
      } catch { /* ignore */ }
    }, 350);
  });

  const submit = async (form, errEl, path, body) => {
    const btn = $('button[type=submit]', form);
    errEl.textContent = ''; btn.disabled = true;
    try {
      const d = await api(path, { method: 'POST', body });
      S.token = d.token; localStorage.setItem('token', d.token);
      await boot();
    } catch (e) { errEl.textContent = e.message; }
    btn.disabled = false;
  };
  $('#formLogin').addEventListener('submit', (e) => { e.preventDefault(); submit(e.target, $('#lgErr'), '/auth/login', { login: $('#lgLogin').value, password: $('#lgPass').value }); });
  $('#formReg').addEventListener('submit', (e) => {
    e.preventDefault();
    submit(e.target, $('#rgErr'), '/auth/register', { display_name: $('#rgName').value, username: $('#rgUser').value, email: $('#rgEmail').value, password: $('#rgPass').value });
  });
}

function resetState() {
  S.me = null; S.users = new Map(); S.online = new Set(); S.chats = []; S.activeId = null; S.msgs = []; S.stories = [];
  closeAllPanels(); [...S.views].forEach((v) => v.close());
  $('#chatView').classList.add('hidden'); $('#chatEmpty').classList.remove('hidden'); $('#chatPane').classList.remove('open');
  $('#chatList').innerHTML = ''; $('#storyBar').innerHTML = '';
}
function forceLogout(errKey) {
  if (S.socket) { S.socket.disconnect(); S.socket = null; }
  localStorage.removeItem('token'); S.token = '';
  resetState(); showScreen('auth');
  if (errKey) $('#lgErr').textContent = t(errKey);
}
const doLogout = () => forceLogout();

/* =====================================================================
   boot + realtime
   ===================================================================== */
async function boot() {
  const me = await api('/me');
  S.me = me;
  const sv = me.settings || {};
  if (sv.theme) { Object.assign(S.set, sv); localStorage.setItem('set', JSON.stringify(S.set)); }
  if (sv.lang && sv.lang !== LANG && LANGS.some((l) => l.code === sv.lang)) { setLang(sv.lang); localStorage.setItem('lang', sv.lang); applyStaticI18n(); fillChrome(); }
  applySettings();
  const [users, chats] = await Promise.all([api('/users'), api('/chats')]);
  S.users = new Map(users.users.map((u) => [u.id, u]));
  S.users.set(me.id, { ...me });
  S.chats = chats.chats; sortChats();
  showScreen('app');
  renderList(); fillChrome();
  connectSocket();
  loadStories();
  handleInviteRoute();
}

function connectSocket() {
  if (S.socket) S.socket.disconnect();
  const s = io({ auth: { token: S.token } });
  S.socket = s;
  let first = true;
  s.on('connect', async () => {
    if (first) { first = false; return; }
    await reloadChats();
    if (S.activeId != null) reloadActiveMessages();
    loadStories();
  });
  s.on('connect_error', (e) => { if (e.message === 'unauthorized') forceLogout(); });
  s.on('presence:init', ({ ids }) => { S.online = new Set(ids); renderList(); renderHead(); });
  s.on('presence', ({ user_id, online, last_seen, hidden }) => {
    online ? S.online.add(user_id) : S.online.delete(user_id);
    const u = userOf(user_id);
    if (u) { if (last_seen) u.last_seen = last_seen; if (hidden) { u.presence_hidden = true; u.last_seen = null; } }
    renderList(); renderHead();
  });
  s.on('user:new', ({ user }) => { S.users.set(user.id, user); });
  s.on('user:update', ({ user }) => {
    if (user.id === S.me.id) { Object.assign(S.me, user); S.users.set(user.id, { ...S.me }); } else S.users.set(user.id, user);
    S.chats.forEach((c) => { if (c.peer && c.peer.id === user.id) c.peer = user; });
    renderList(); renderStoryBar();
    if (S.activeId != null) { renderHead(); $$('.row').forEach((r) => { if (r.dataset.u == user.id) rerenderRow(Number(r.dataset.id)); }); }
  });
  s.on('user:delete', ({ id }) => { S.users.delete(id); renderList(); });
  s.on('chat:update', ({ chat }) => {
    const c = chatById(chat.id);
    if (!c) return;
    Object.assign(c, { title: chat.title, description: chat.description, closed: chat.closed, avatar: chat.avatar, members: chat.members });
    renderList();
    if (c.id === S.activeId) { renderHead(); renderComposerState(); }
    refreshPanels();
  });
  const removeChat = ({ id }) => {
    S.chats = S.chats.filter((c) => c.id !== id);
    if (S.activeId === id) closeChat();
    renderList(); refreshPanels();
  };
  s.on('chat:delete', removeChat);
  s.on('chat:removed', removeChat);
  s.on('chats:refresh', reloadChats);
  s.on('chat:cleared', ({ chat_id }) => {
    const c = chatById(chat_id);
    if (c) { c.last = null; c.unread = 0; }
    if (chat_id === S.activeId) { S.msgs = []; renderAllMessages(); }
    renderList();
  });
  s.on('message:new', ({ message }) => onNewMessage(message));
  s.on('message:edit', ({ message }) => {
    const i = S.msgs.findIndex((m) => m.id === message.id);
    if (i >= 0) { S.msgs[i] = message; rerenderRow(message.id); }
    const c = chatById(message.chat_id);
    if (c && c.last && c.last.id === message.id) { c.last.text = message.text; renderList(); }
  });
  s.on('message:delete', ({ chat_id, id }) => onDeleted(chat_id, id));
  s.on('message:reaction', ({ chat_id, message_id, reactions }) => {
    if (chat_id !== S.activeId) return;
    const m = S.msgs.find((x) => x.id === message_id);
    if (m) { m.reactions = reactions; rerenderRow(message_id); }
  });
  s.on('chat:read', ({ chat_id, last_id }) => {
    if (chat_id !== S.activeId) return;
    S.peerRead = Math.max(S.peerRead, last_id);
    refreshTicks();
  });
  s.on('typing', ({ chat_id, user_id }) => {
    (S.typing[chat_id] ||= {})[user_id] = Date.now();
    renderList(); renderHead();
    setTimeout(() => { renderList(); renderHead(); }, 4100);
  });
  s.on('story:update', () => { clearTimeout(loadStories._t); loadStories._t = setTimeout(loadStories, 400); });
}

async function reloadChats() {
  try {
    const d = await api('/chats');
    S.chats = d.chats; sortChats();
    if (S.activeId != null && !chatById(S.activeId)) closeChat();
    renderList(); renderHead(); renderComposerState(); refreshPanels();
  } catch { /* ignore */ }
}
function upsertChat(c) {
  const i = S.chats.findIndex((x) => x.id === c.id);
  if (i >= 0) S.chats[i] = { ...S.chats[i], ...c }; else S.chats.push(c);
  if (c.peer) S.users.set(c.peer.id, { ...(S.users.get(c.peer.id) || {}), ...c.peer });
  sortChats();
}
const typingNames = (chatId) => {
  const m = S.typing[chatId] || {};
  const now = Date.now();
  return Object.keys(m).filter((uid) => now - m[uid] < 4000 && Number(uid) !== S.me.id).map((uid) => userOf(Number(uid))?.display_name || '').filter(Boolean);
};

/* =====================================================================
   chat list
   ===================================================================== */
function chatRow(c) {
  const typ = typingNames(c.id);
  let sub;
  if (typ.length) sub = `<span class="typing">${esc(c.type === 'group' ? typ[0] + ' ' : '')}${esc(t('typing'))}<span class="typing-dots"><i></i><i></i><i></i></span></span>`;
  else if (c.last) {
    const mine = c.last.sender_id === S.me.id;
    const pre = mine ? t('you') + ': ' : c.type === 'group' && c.kind !== 'channel' && c.last.sender_name ? c.last.sender_name.split(' ')[0] + ': ' : '';
    sub = esc(pre + previewText(c.last));
  } else sub = c.saved ? esc(t('saved_sub')) : c.type === 'group' ? esc(c.description || '') : '';
  const kindIc = c.type === 'group' ? ic(c.kind === 'channel' ? 'channel' : 'users', 15) : '';
  return `<div class="ci ${c.id === S.activeId ? 'on' : ''}" data-chat="${c.id}">${chatAv(c, 52)}
    <div class="ci-body"><div class="ci-top"><span class="ci-title">${kindIc}<span class="ellipsis">${esc(chatName(c))}</span></span><span class="ci-time">${c.last ? esc(listTime(c.last.created_at)) : ''}</span></div>
    <div class="ci-bot"><span class="ci-sub ellipsis">${sub}</span>${c.unread ? `<span class="badge">${fnum(c.unread)}</span>` : ''}</div></div></div>`;
}
function renderList() {
  const box = $('#chatList');
  if (!box || !S.me) return;
  const q = S.query.trim().toLowerCase().replace(/^@/, '');
  let h = '';
  if (!q) {
    h = S.chats.filter((c) => c.saved || c.last || c.type === 'group').map(chatRow).join('');
    if (!h) h = `<div class="empty">${esc(t('no_chats'))}</div>`;
  } else {
    const chats = S.chats.filter((c) => chatName(c).toLowerCase().includes(q) || (c.peer?.username || '').includes(q));
    const have = new Set(chats.filter((c) => c.type === 'dm').map((c) => c.peer.id));
    const people = [...S.users.values()].filter((u) => u.id !== S.me.id && !u.banned && !have.has(u.id) && (u.display_name.toLowerCase().includes(q) || u.username.includes(q)));
    if (chats.length) h += `<div class="sec-title">${esc(t('search_chats'))}</div>` + chats.map(chatRow).join('');
    if (people.length) h += `<div class="sec-title">${esc(t('search_people'))}</div>` + people.map((u) => `<div class="ci" data-person="${u.id}">${avatar(u, 52, { dot: S.online.has(u.id) })}<div class="ci-body"><div class="ci-title"><span class="ellipsis">${esc(u.display_name)}</span></div><div class="ci-sub ellipsis">@${esc(u.username)}</div></div></div>`).join('');
    if (!h) h = `<div class="empty">${esc(t('nothing_found'))}</div>`;
  }
  box.innerHTML = h;
}

/* =====================================================================
   chat view
   ===================================================================== */
const msgsEl = () => $('#msgs');
const nearBottom = () => { const s = msgsEl(); return s.scrollHeight - s.scrollTop - s.clientHeight < 140; };
function scrollBottom(smooth) {
  const s = msgsEl();
  s.scrollTo({ top: s.scrollHeight, behavior: smooth && S.set.anim ? 'smooth' : 'auto' });
}
S.drafts = {};
S.jumpN = 0;

async function openChat(id) {
  const c = chatById(id);
  if (!c) return;
  if (S.activeId === id) { $('#chatPane').classList.add('open'); histSync(); return; }
  if (S.activeId != null) S.drafts[S.activeId] = $('#input').value;
  S.activeId = id; S.msgs = []; S.hasMore = false; S.peerRead = c.peer_read || 0; S.reply = null; S.edit = null; S.jumpN = 0;
  stopRecording(false);
  closeEmoji();
  $('#chatEmpty').classList.add('hidden');
  const view = $('#chatView');
  view.classList.remove('hidden');
  view.style.animation = 'none'; void view.offsetWidth; view.style.animation = '';
  $('#chatPane').classList.add('open');
  $('#msgList').innerHTML = '';
  $('#input').value = S.drafts[id] || ''; autoGrow(); syncSendBtn(); updateCtx();
  $('#jump').classList.add('hidden');
  renderHead(); renderComposerState(); renderList(); histSync();
  await reloadActiveMessages(true);
}
async function reloadActiveMessages(initial) {
  const id = S.activeId;
  try {
    const d = await api(`/chats/${id}/messages?limit=50`);
    if (S.activeId !== id) return;
    S.msgs = d.messages; S.hasMore = d.has_more;
    if (d.peer_read != null) S.peerRead = d.peer_read;
    renderAllMessages();
    scrollBottom(false);
    markRead();
  } catch (e) { if (initial) toast(e.message, true); }
}
function closeChat() {
  if (S.activeId != null) S.drafts[S.activeId] = $('#input').value;
  S.activeId = null; S.msgs = [];
  stopRecording(false);
  $('#chatPane').classList.remove('open');
  $('#chatView').classList.add('hidden');
  $('#chatEmpty').classList.remove('hidden');
  renderList(); histSync();
}

function renderHead() {
  const c = activeChat();
  if (!c || !S.me) return;
  $('#headAv').innerHTML = chatAv(c, 42);
  $('#headTitle').innerHTML = `${c.type === 'group' ? ic(c.kind === 'channel' ? 'channel' : 'users', 15) : ''}<span class="ellipsis">${esc(chatName(c))}</span>`;
  const sub = $('#headSub');
  const typ = typingNames(c.id);
  sub.classList.remove('on');
  if (typ.length) { sub.classList.add('on'); sub.innerHTML = `${esc(c.type === 'group' ? typ.join(', ') + ' ' : '')}${esc(t('typing'))}<span class="typing-dots"><i></i><i></i><i></i></span>`; }
  else if (c.saved) sub.textContent = t('saved_sub');
  else if (c.type === 'dm') { const u = userOf(c.peer.id) || c.peer; sub.textContent = seenText(u); if (S.online.has(u.id)) sub.classList.add('on'); }
  else sub.textContent = t(c.kind === 'channel' ? 'subs_n' : 'members_n', { n: fnum(c.members || 0) });
}
function renderComposerState() {
  const c = activeChat();
  if (!c) return;
  const ok = canPostLocal(c);
  $('#composer').classList.toggle('hidden', !ok);
  const np = $('#noPost');
  np.classList.toggle('hidden', ok);
  np.textContent = c.kind === 'channel' ? t('channel_readonly') : t('group_closed');
  if (!ok) closeEmoji();
}

/* ---------------- message rendering ---------------- */
const GROUP_GAP = 5 * 60 * 1000;
function sameBlock(a, b) {
  return a && b && a.sender?.id === b.sender?.id && sameDay(a.created_at, b.created_at) && Math.abs(b.created_at - a.created_at) < GROUP_GAP && a.sender;
}
function mediaHTML(m) {
  const f = m.file;
  const ar = f.w && f.h ? `style="aspect-ratio:${f.w}/${f.h}"` : '';
  const cls = f.w && f.h ? 'media' : 'media nodim';
  if (m.type === 'image') return `<div class="${cls}" ${ar} data-open="${esc(f.url)}" data-type="image"><img src="${esc(f.url)}" alt="" loading="lazy" decoding="async"></div>`;
  return `<div class="${cls}" ${ar} data-open="${esc(f.url)}" data-type="video"><video src="${esc(f.url)}#t=0.1" preload="metadata" muted playsinline></video><div class="play"><i>${ic('play', 24)}</i></div></div>`;
}
function bodyHTML(m) {
  let h = '';
  const f = m.file;
  if (m.type === 'image' || m.type === 'video') h += mediaHTML(m);
  else if (m.type === 'voice') h += `<div class="voice" data-voice="${esc(f.url)}" data-dur="${f.duration || 0}"><button type="button" data-vbtn>${ic('play', 20)}</button><div class="bar"><i></i></div><small>${fdur(f.duration)}</small></div>`;
  else if (m.type === 'file') h += `<a class="filebox" href="${esc(f.url)}" download="${esc(f.name || 'file')}" target="_blank" rel="noopener"><span class="ic">${ic('file', 22)}</span><span class="grow"><b class="ellipsis" style="display:block;max-width:220px">${esc(f.name || 'file')}</b><small>${esc(fsize(f.size))}</small></span></a>`;
  if (m.text) h += `<div class="btext">${linkify(m.text)}</div>`;
  return h;
}
function msgHTML(m, prev, next, c, isNew) {
  const mine = m.sender?.id === S.me.id;
  const first = !sameBlock(prev, m), last = !sameBlock(m, next);
  const chan = c.kind === 'channel';
  const showName = c.type === 'group' && !mine && !chan && first && m.sender;
  const showAv = c.type === 'group' && !mine && !chan;
  const seen = mine && m.id <= S.peerRead;
  const ticks = mine && c.type === 'dm' && !c.saved ? `<span class="ticks ${seen ? 'seen' : ''}">${ic(seen ? 'checks' : 'check', 15)}</span>` : '';
  const reply = m.reply ? `<div class="reply" data-goto="${m.reply.id}"><b>${esc(m.reply.name || '')}</b><span>${esc(previewText(m.reply))}</span></div>` : '';
  const reacts = m.reactions.length ? `<div class="reacts">${m.reactions.map((r) => `<button type="button" class="react ${r.users.includes(S.me.id) ? 'me' : ''}" data-emoji="${r.emoji}">${r.emoji}<span>${r.users.length > 1 ? fnum(r.users.length) : ''}</span></button>`).join('')}</div>` : '';
  return `<div class="row ${mine ? 'mine' : ''} ${first ? 'first' : ''} ${last ? 'last' : ''} ${isNew ? 'new' : ''}" data-id="${m.id}" data-u="${m.sender?.id || ''}">
    ${showAv ? `<div class="slot">${last && m.sender ? avatar({ ...m.sender, ...(userOf(m.sender.id) || {}) }, 34, { link: true }) : ''}</div>` : ''}
    <div class="bwrap"><div class="bubble">
      ${showName ? `<span class="sname" data-user="${m.sender.id}" style="color:${GRADS[m.sender.id % GRADS.length][1]}">${esc(m.sender.display_name)}</span>` : ''}
      ${m.fwd ? `<div class="fwd">${ic('fwd', 13)}<span>${esc(t('fwd_from', { name: m.fwd }))}</span></div>` : ''}
      ${reply}${bodyHTML(m)}
      <span class="meta">${m.edited_at ? esc(t('edited')) + ' ' : ''}${esc(fTime(m.created_at))}${ticks}</span>
      ${reacts}
    </div></div></div>`;
}
const dayHTML = (ts) => `<div class="day" data-day="${new Date(ts).toDateString()}"><span>${esc(dayLabel(ts))}</span></div>`;
function renderAllMessages() {
  const c = activeChat();
  if (!c) return;
  let h = '', prev = null;
  S.msgs.forEach((m, i) => {
    if (!prev || !sameDay(prev.created_at, m.created_at)) h += dayHTML(m.created_at);
    h += msgHTML(m, prev, S.msgs[i + 1], c, false);
    prev = m;
  });
  $('#msgList').innerHTML = h;
}
function rerenderRow(id) {
  const c = activeChat();
  const i = S.msgs.findIndex((m) => m.id === id);
  const el = $(`.row[data-id="${id}"]`);
  if (!c || i < 0 || !el) return;
  const keepBottom = nearBottom();
  el.outerHTML = msgHTML(S.msgs[i], S.msgs[i - 1], S.msgs[i + 1], c, false);
  if (keepBottom) scrollBottom(false);
}
function addMessage(m, isNew) {
  const c = activeChat();
  if (!c || m.chat_id !== c.id || S.msgs.some((x) => x.id === m.id)) return;
  const prev = S.msgs[S.msgs.length - 1] || null;
  S.msgs.push(m);
  const list = $('#msgList');
  if (!prev || !sameDay(prev.created_at, m.created_at)) list.insertAdjacentHTML('beforeend', dayHTML(m.created_at));
  list.insertAdjacentHTML('beforeend', msgHTML(m, prev, null, c, isNew));
  if (prev && sameBlock(prev, m)) rerenderRowSilent(prev.id);
}
function rerenderRowSilent(id) {
  const c = activeChat();
  const i = S.msgs.findIndex((m) => m.id === id);
  const el = $(`.row[data-id="${id}"]`);
  if (c && i >= 0 && el) el.outerHTML = msgHTML(S.msgs[i], S.msgs[i - 1], S.msgs[i + 1], c, false);
}
function refreshTicks() {
  $$('.row.mine').forEach((r) => {
    const t2 = $('.ticks', r);
    if (t2 && !t2.classList.contains('seen') && Number(r.dataset.id) <= S.peerRead) { t2.classList.add('seen'); t2.innerHTML = ic('checks', 15); }
  });
}
function onDeleted(chatId, id) {
  const c = chatById(chatId);
  if (c && c.last && c.last.id === id) { c.last = null; reloadChats(); }
  if (chatId !== S.activeId) return;
  const i = S.msgs.findIndex((m) => m.id === id);
  if (i < 0) return;
  const el = $(`.row[data-id="${id}"]`);
  S.msgs.splice(i, 1);
  const soleOfDay = el && el.previousElementSibling?.classList.contains('day') && (!el.nextElementSibling || el.nextElementSibling.classList.contains('day'));
  if (soleOfDay) { renderAllMessages(); return; }
  el && el.remove();
  if (S.msgs[i - 1]) rerenderRowSilent(S.msgs[i - 1].id);
  if (S.msgs[i]) rerenderRowSilent(S.msgs[i].id);
}
async function onNewMessage(m) {
  let c = chatById(m.chat_id);
  if (!c) { await reloadChats(); c = chatById(m.chat_id); if (!c) return; }
  c.last = { id: m.id, type: m.type, text: m.text, created_at: m.created_at, sender_id: m.sender?.id || null, sender_name: m.sender?.display_name || '' };
  const mine = m.sender?.id === S.me.id;
  if (S.typing[c.id] && m.sender) delete S.typing[c.id][m.sender.id];
  if (m.chat_id === S.activeId) {
    const wasNear = nearBottom();
    addMessage(m, true);
    if (mine || wasNear) scrollBottom(mine);
    else if (!mine) { S.jumpN++; updateJump(); }
    if (!mine) { if (document.visibilityState === 'visible') markRead(); else c.unread++; }
  } else if (!mine) c.unread++;
  sortChats(); renderList(); renderHead();
}
let readT;
function markRead() {
  const c = activeChat();
  if (!c) return;
  const last = S.msgs.length ? S.msgs[S.msgs.length - 1].id : 0;
  if (!last || (last <= c.my_read && !c.unread)) return;
  c.my_read = Math.max(c.my_read || 0, last); c.unread = 0;
  renderList();
  clearTimeout(readT);
  readT = setTimeout(() => api(`/chats/${c.id}/read`, { method: 'POST', body: { last_id: last } }).catch(() => {}), 250);
}
function updateJump() {
  const far = msgsEl().scrollHeight - msgsEl().scrollTop - msgsEl().clientHeight > 300;
  $('#jump').classList.toggle('hidden', !far);
  $('#jumpBadge').innerHTML = S.jumpN ? `<span class="badge">${fnum(S.jumpN)}</span>` : ic('down', 22);
}
let loadingOlder = false;
async function loadOlder() {
  if (loadingOlder || !S.hasMore || !S.msgs.length) return;
  loadingOlder = true;
  const id = S.activeId, sc = msgsEl(), h0 = sc.scrollHeight, t0 = sc.scrollTop;
  try {
    const d = await api(`/chats/${id}/messages?limit=50&before=${S.msgs[0].id}`);
    if (S.activeId !== id) return;
    S.msgs = [...d.messages, ...S.msgs]; S.hasMore = d.has_more;
    renderAllMessages();
    sc.scrollTop = t0 + (sc.scrollHeight - h0);
  } catch { /* ignore */ }
  loadingOlder = false;
}

/* =====================================================================
   message menu, reactions, reply, edit, delete
   ===================================================================== */
function openMsgMenu(id, x, y) {
  const m = S.msgs.find((q) => q.id === id), c = activeChat();
  if (!m || !c) return;
  const mine = m.sender?.id === S.me.id;
  const canPost = canPostLocal(c);
  let h = `<div class="react-row">${REACTIONS.slice(0, 6).map((e) => `<button type="button" data-act="react" data-e="${e}">${e}</button>`).join('')}</div>`;
  if (canPost) h += menuItem('reply', 'reply', t('reply'));
  if (m.text) h += menuItem('copy', 'copy', t('copy'));
  h += menuItem('fwd', 'fwd', t('forward'));
  if (mine && canPost && (m.type === 'text' || m.text)) h += menuItem('edit', 'edit', t('edit'));
  h += '<hr>' + menuItem('del', 'trash', t('delete'), 'danger');
  popup(h, { x, y, onPick: (act, d) => {
    if (act === 'react') react(id, d.e);
    else if (act === 'reply') startReply(m);
    else if (act === 'copy') copyText(m.text);
    else if (act === 'fwd') openForward(m);
    else if (act === 'edit') startEdit(m);
    else if (act === 'del') openDeleteMenu(m, x, y);
  } });
}
function openDeleteMenu(m, x, y) {
  const c = activeChat();
  const mine = m.sender?.id === S.me.id;
  const both = mine || c.can_manage;
  let h = `<div class="ptitle">${esc(t('delete'))}</div>` + menuItem('me', 'trash', t('del_me'));
  if (both) h += menuItem('all', 'trash', c.type === 'dm' && !c.saved ? t('del_both', { name: c.peer.display_name.split(' ')[0] }) : t('del_all'), 'danger');
  popup(h, { x, y, onPick: async (scope) => {
    try {
      await api(`/messages/${m.id}?scope=${scope}`, { method: 'DELETE' });
      if (scope === 'me') onDeleted(c.id, m.id);
    } catch (e) { toast(e.message, true); }
  } });
}
async function react(id, emoji) {
  try { await api(`/messages/${id}/reaction`, { method: 'PUT', body: { emoji } }); } catch (e) { toast(e.message, true); }
}
function startReply(m) {
  S.edit = null; S.reply = { id: m.id, name: m.sender?.display_name || '', text: previewText(m) };
  updateCtx(); $('#input').focus({ preventScroll: true });
}
function startEdit(m) {
  S.reply = null; S.edit = m;
  $('#input').value = m.text; autoGrow(); syncSendBtn(); updateCtx(); $('#input').focus({ preventScroll: true });
}
function updateCtx() {
  const bar = $('#ctxBar');
  const on = S.reply || S.edit;
  bar.classList.toggle('hidden', !on);
  if (!on) return;
  $('#ctxIc').innerHTML = ic(S.edit ? 'edit' : 'reply', 20);
  $('#ctxTitle').textContent = S.edit ? t('editing') : t('reply_to', { name: S.reply.name });
  $('#ctxText').textContent = S.edit ? previewText(S.edit) : S.reply.text;
}
function clearCtx() { S.reply = null; S.edit = null; updateCtx(); }

/* =====================================================================
   composer
   ===================================================================== */
const inputEl = () => $('#input');
function autoGrow() {
  const el = inputEl();
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}
function syncSendBtn() {
  const b = $('#btnSend');
  if (!b) return;
  const hasText = inputEl().value.trim().length > 0 || S.edit;
  const mode = S.rec ? 'send-rec' : hasText ? 'send' : 'mic';
  if (b.dataset.mode === mode) return;
  b.dataset.mode = mode;
  b.innerHTML = ic(mode === 'mic' ? 'mic' : 'send', 22);
  b.classList.toggle('rec', false);
  b.setAttribute('aria-label', t(mode === 'mic' ? 'voice' : 'send'));
}
async function sendText() {
  const c = activeChat();
  const el = inputEl();
  const text = el.value.trim();
  if (!c || !text) return;
  if (S.edit) {
    const id = S.edit.id;
    el.value = ''; clearCtx(); autoGrow(); syncSendBtn();
    try { await api('/messages/' + id, { method: 'PATCH', body: { text } }); } catch (e) { toast(e.message, true); }
    return;
  }
  const body = { text };
  if (S.reply) body.reply_to = S.reply.id;
  el.value = ''; delete S.drafts[c.id]; clearCtx(); autoGrow(); syncSendBtn();
  el.focus({ preventScroll: true });
  try {
    const d = await api(`/chats/${c.id}/messages`, { method: 'POST', body });
    if (S.activeId === c.id && !S.msgs.some((x) => x.id === d.message.id)) { addMessage(d.message, true); scrollBottom(true); }
  } catch (e) { toast(e.message, true); el.value = text; autoGrow(); syncSendBtn(); }
}

function progressToast(label) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = label;
  $('#toasts').append(el);
  return { set: (p) => { el.textContent = `${label} ${fnum(Math.round(p * 100))}%`; }, done: () => el.remove() };
}
async function uploadMessage(chatId, file, { caption = '', w, h, duration, name } = {}) {
  const fd = new FormData();
  fd.append('file', file, name || file.name || 'file');
  fd.append('file_name', name || file.name || 'file');
  if (caption) fd.append('text', caption);
  if (duration) fd.append('duration', Math.round(duration));
  if (w && h) { fd.append('w', w); fd.append('h', h); }
  if (S.reply) { fd.append('reply_to', S.reply.id); clearCtx(); }
  const pt = progressToast(t('uploading'));
  try {
    const d = await uploadXHR(`/chats/${chatId}/messages`, fd, pt.set);
    if (S.activeId === chatId && !S.msgs.some((x) => x.id === d.message.id)) { addMessage(d.message, true); scrollBottom(true); }
  } catch (e) { toast(e.message, true); }
  pt.done();
}
const isMediaFile = (f) => f.type.startsWith('image/') || f.type.startsWith('video/');
async function sendFiles(files) {
  const c = activeChat();
  if (!c) return;
  const list = [...files];
  const total = list.filter(isMediaFile).length;
  let i = 0, firstPlain = true;
  for (const f of list) {
    if (S.activeId !== c.id) break;
    if (isMediaFile(f)) {
      const r = await openMediaCompose(f, { index: ++i, total });
      if (!r) break;
      await uploadMessage(c.id, r.file, { caption: r.caption, w: r.w, h: r.h });
    } else {
      const cap = firstPlain ? inputEl().value.trim() : '';
      if (cap) { inputEl().value = ''; autoGrow(); syncSendBtn(); }
      firstPlain = false;
      await uploadMessage(c.id, f, { caption: cap });
    }
  }
}

/* ---- voice ---- */
async function startRecording() {
  if (S.rec || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast(t('e.no_mic'), true);
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast(t('e.no_mic'), true); }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const st = { rec, stream, chunks, t0: Date.now(), send: false, chatId: S.activeId, mime: rec.mimeType || mime || 'audio/webm' };
  rec.onstop = () => {
    stream.getTracks().forEach((x) => x.stop());
    const dur = (Date.now() - st.t0) / 1000;
    if (st.send && dur >= 0.8) uploadMessage(st.chatId, new File(chunks, 'voice', { type: st.mime }), { duration: dur, name: 'voice' });
  };
  rec.start();
  S.rec = st;
  $('#composerBox').innerHTML = `<div class="rec-bar"><i></i><span id="recT">0:00</span><span class="grow"></span><button type="button" class="icon-btn" id="recCancel" style="color:var(--danger)">${ic('trash', 20)}</button></div>`;
  $('#btnAttach').classList.add('hidden'); $('#btnEmoji').classList.add('hidden');
  st.timer = setInterval(() => { const e = $('#recT'); if (e) e.textContent = fdur((Date.now() - st.t0) / 1000); }, 250);
  $('#btnSend').dataset.mode = ''; syncSendBtn();
}
function stopRecording(send) {
  const st = S.rec;
  if (!st) return;
  S.rec = null;
  clearInterval(st.timer);
  st.send = send;
  try { st.rec.state !== 'inactive' && st.rec.stop(); } catch { /* ignore */ }
  $('#composerBox').innerHTML = `<textarea id="input" rows="1" maxlength="4000" placeholder="${esc(t('message_ph'))}" enterkeyhint="send"></textarea>`;
  bindInput();
  $('#btnAttach').classList.remove('hidden'); $('#btnEmoji').classList.remove('hidden');
  $('#btnSend').dataset.mode = ''; syncSendBtn();
}

/* ---- emoji ---- */
function closeEmoji() { $('#emojiPanel').classList.add('hidden'); }
function toggleEmoji() {
  const p = $('#emojiPanel');
  if (!p.classList.contains('hidden')) return closeEmoji();
  const keys = Object.keys(EMOJI_SETS);
  const draw = (k) => {
    p.innerHTML = `<div class="emoji-tabs">${keys.map((x) => `<button type="button" data-k="${x}" class="${x === k ? 'on' : ''}">${x}</button>`).join('')}</div>
      <div class="emoji-grid">${EMOJI_SETS[k].split(' ').map((e) => `<button type="button" data-e="${e}">${e}</button>`).join('')}</div>`;
  };
  draw(keys[0]);
  p.classList.remove('hidden');
  p.onpointerdown = (e) => e.preventDefault();
  p.onclick = (e) => {
    const k = e.target.closest('[data-k]'), em = e.target.closest('[data-e]');
    if (k) draw(k.dataset.k);
    else if (em) {
      const el = inputEl(), s = el.selectionStart ?? el.value.length, en = el.selectionEnd ?? s;
      el.value = el.value.slice(0, s) + em.dataset.e + el.value.slice(en);
      el.selectionStart = el.selectionEnd = s + em.dataset.e.length;
      autoGrow(); syncSendBtn();
    }
  };
}

let lastTyping = 0;
function bindInput() {
  const el = inputEl();
  el.addEventListener('input', () => {
    autoGrow(); syncSendBtn();
    const now = Date.now();
    if (S.socket && S.activeId != null && now - lastTyping > 2500 && el.value) { lastTyping = now; S.socket.emit('typing', { chat_id: S.activeId }); }
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isMobile()) { e.preventDefault(); sendText(); }
    else if (e.key === 'Escape' && (S.reply || S.edit)) { clearCtx(); el.value = ''; autoGrow(); syncSendBtn(); }
  });
  el.addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); sendFiles(files); }
  });
}

/* =====================================================================
   voice player
   ===================================================================== */
function toggleVoice(box) {
  const url = box.dataset.voice, btn = $('[data-vbtn]', box), bar = $('.bar i', box), lab = $('small', box);
  if (S.audio && S.audio.url === url) {
    if (S.audio.el.paused) { S.audio.el.play(); btn.innerHTML = ic('pause', 20); } else { S.audio.el.pause(); btn.innerHTML = ic('play', 20); }
    return;
  }
  if (S.audio) { S.audio.el.pause(); S.audio.reset(); }
  const el = new Audio(url);
  const total = Number(box.dataset.dur) || 0;
  S.audio = { url, el, reset() { btn.innerHTML = ic('play', 20); bar.style.width = '0'; lab.textContent = fdur(total); } };
  el.ontimeupdate = () => { const d = el.duration && isFinite(el.duration) ? el.duration : total; if (d) { bar.style.width = (el.currentTime / d) * 100 + '%'; lab.textContent = fdur(el.currentTime); } };
  el.onended = () => { S.audio && S.audio.reset(); S.audio = null; };
  el.play().then(() => { btn.innerHTML = ic('pause', 20); }).catch(() => toast(t('e.play_failed'), true));
}

/* =====================================================================
   chat header menu, clear history
   ===================================================================== */
function openChatMenu() {
  const c = activeChat();
  if (!c) return;
  let h = '';
  if (!c.saved) h += menuItem('info', 'info', c.type === 'group' ? t(c.kind === 'channel' ? 'channel_info' : 'group_info') : t('profile'));
  h += menuItem('clear', 'clean', t('clear_history'));
  if (c.type === 'group' && !c.official && c.my_role !== 'admin') h += menuItem('leave', 'logout', t(c.kind === 'channel' ? 'leave_channel' : 'leave_group'), 'danger');
  const anchor = $('#btnChatMenu');
  popup(h, { anchor, onPick: (act) => {
    if (act === 'info') openChatInfoFor(c);
    else if (act === 'clear') openClearMenu(anchor);
    else if (act === 'leave') leaveChat(c);
  } });
}
function openChatInfoFor(c) { c.type === 'group' ? openChatInfo(c.id) : openProfile(c.peer.id); }
function openClearMenu(anchor) {
  const c = activeChat();
  let h = `<div class="ptitle">${esc(t('clear_history'))}</div>`;
  if (c.saved) h += menuItem('all', 'clean', t('clear_history'), 'danger');
  else {
    h += menuItem('me', 'clean', t('clear_me'));
    if (c.type === 'dm') h += menuItem('all', 'clean', t('clear_both', { name: c.peer.display_name.split(' ')[0] }), 'danger');
    else if (c.can_manage) h += menuItem('all', 'clean', t('clear_all'), 'danger');
  }
  popup(h, { anchor, onPick: (scope) => clearHistory(c.id, scope) });
}
async function clearHistory(id, scope) {
  try {
    await api(`/chats/${id}/clear`, { method: 'POST', body: { scope } });
    if (scope === 'me') {
      const c = chatById(id);
      if (c) { c.last = null; c.unread = 0; }
      if (S.activeId === id) { S.msgs = []; renderAllMessages(); }
      renderList();
    }
    toast(t('history_cleared'));
  } catch (e) { toast(e.message, true); }
}
async function leaveChat(c) {
  try {
    await api(`/chats/${c.id}/leave`, { method: 'POST' });
    S.chats = S.chats.filter((x) => x.id !== c.id);
    if (S.activeId === c.id) closeChat();
    closeAllPanels(); renderList();
  } catch (e) { toast(e.message, true); }
}

/* =====================================================================
   main menu + events
   ===================================================================== */
function openMainMenu() {
  const dark = document.documentElement.dataset.dark === '1';
  const h = menuItem('settings', 'settings', t('settings')) + menuItem('contacts', 'users', t('contacts')) + menuItem('saved', 'bookmark', t('saved')) + '<hr>' +
    menuItem('group', 'users', t('new_group')) + menuItem('channel', 'channel', t('new_channel')) + '<hr>' +
    menuItem('night', dark ? 'sun' : 'moon', dark ? t('day_mode') : t('night_mode'));
  popup(h, { anchor: $('#btnMenu'), onPick: (act) => {
    if (act === 'settings') openSettings();
    else if (act === 'contacts') openContacts();
    else if (act === 'saved') { const c = S.chats.find((x) => x.saved); c && openChat(c.id); }
    else if (act === 'group') openNewChat('group');
    else if (act === 'channel') openNewChat('channel');
    else if (act === 'night') saveSet({ theme: dark ? 'classic' : 'night' }, { animate: true });
  } });
}

function bindEvents() {
  $('#btnMenu').onclick = openMainMenu;
  $('#fab').onclick = openContacts;
  $('#btnBack').onclick = () => closeChat();
  $('#btnChatMenu').onclick = openChatMenu;
  $('#chatWho').onclick = () => { const c = activeChat(); c && !c.saved && openChatInfoFor(c); };
  $('#storyBar').addEventListener('click', onStoryBarClick);
  $('#search').addEventListener('input', (e) => { S.query = e.target.value; renderList(); });
  $('#chatList').addEventListener('click', (e) => {
    const row = e.target.closest('[data-chat]'), person = e.target.closest('[data-person]');
    if (row) { openChat(Number(row.dataset.chat)); }
    else if (person) { $('#search').value = ''; S.query = ''; openDM(Number(person.dataset.person)); }
  });
  $('#chatList').addEventListener('contextmenu', (e) => {
    const row = e.target.closest('[data-chat]');
    if (!row) return;
    e.preventDefault();
    const id = Number(row.dataset.chat);
    popup(menuItem('open', 'chat', t('open')) + menuItem('clear', 'clean', t('clear_me')), { x: e.clientX, y: e.clientY, onPick: (a) => (a === 'open' ? openChat(id) : clearHistory(id, 'me')) });
  });

  // composer
  bindInput();
  const keep = (e) => e.preventDefault(); // keep the keyboard open when pressing buttons
  ['#btnSend', '#btnAttach', '#btnEmoji', '#jump'].forEach((s) => $(s).addEventListener('pointerdown', keep));
  $('#btnSend').onclick = () => {
    const mode = $('#btnSend').dataset.mode;
    if (mode === 'mic') startRecording();
    else if (mode === 'send-rec') stopRecording(true);
    else sendText();
  };
  $('#composerBox').addEventListener('click', (e) => { if (e.target.closest('#recCancel')) stopRecording(false); });
  $('#btnEmoji').onclick = toggleEmoji;
  $('#btnAttach').onclick = () => $('#fileAny').click();
  $('#fileAny').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; f.length && sendFiles(f); };
  $('#ctxClose').onclick = () => { if (S.edit) { inputEl().value = ''; autoGrow(); syncSendBtn(); } clearCtx(); };
  $('#jump').onclick = () => { S.jumpN = 0; scrollBottom(true); };

  // message list
  const list = $('#msgList');
  list.addEventListener('click', (e) => {
    const t1 = e.target;
    const u = t1.closest('[data-user]');
    if (u) return openProfile(Number(u.dataset.user));
    const med = t1.closest('[data-open]');
    if (med) return openLightbox(med.dataset.open, med.dataset.type);
    const vo = t1.closest('[data-voice]');
    if (vo && t1.closest('[data-vbtn]')) return toggleVoice(vo);
    const re = t1.closest('.react');
    if (re) return react(Number(re.closest('.row').dataset.id), re.dataset.emoji);
    const gt = t1.closest('[data-goto]');
    if (gt) {
      const el = $(`.row[data-id="${gt.dataset.goto}"]`);
      if (el) { el.scrollIntoView({ block: 'center', behavior: S.set.anim ? 'smooth' : 'auto' }); const b = $('.bubble', el); b.animate([{ outline: '2px solid var(--accent)' }, { outline: '2px solid transparent' }], { duration: 1200 }); }
      return;
    }
    if (t1.closest('a')) return;
    const row = t1.closest('.row');
    if (row && matchMedia('(pointer: coarse)').matches) { const r = row.getBoundingClientRect(); openMsgMenu(Number(row.dataset.id), r.left + r.width / 2 - 100, Math.min(e.clientY, innerHeight - 340)); }
  });
  list.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    e.preventDefault();
    openMsgMenu(Number(row.dataset.id), e.clientX, e.clientY);
  });
  list.addEventListener('load', () => { if (S.stick) msgsEl().scrollTop = msgsEl().scrollHeight; }, true);
  S.stick = true;
  msgsEl().addEventListener('scroll', () => {
    S.stick = nearBottom();
    if (S.stick) { S.jumpN = 0; markRead(); }
    updateJump();
    if (msgsEl().scrollTop < 120) loadOlder();
  }, { passive: true });

  // drag & drop files
  const pane = $('#chatPane');
  pane.addEventListener('dragover', (e) => e.preventDefault());
  pane.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer?.files?.length && S.activeId != null) sendFiles(e.dataTransfer.files); });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') markRead(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => S.set.theme === 'auto' && applySettings({ animate: true }));
  // keyboard: Esc closes the top-most layer
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !S.hist) return;
    if (!$('#pop').classList.contains('hidden')) return closePopup();
    if (S.views.length) return;
    if (S.panels.length) S.panels[S.panels.length - 1].close();
  });
}

/* =====================================================================
   init
   ===================================================================== */
async function init() {
  const cfg = await fetch('/api/config').then((r) => r.json()).catch(() => ({}));
  S.appName = cfg.app_name;
  // invite links (/g/<code> for groups, /c/<code> for channels) survive the login screen
  const m = location.pathname.match(/^\/([gc])\/([\w-]{8,40})\/?$/);
  if (m) { sessionStorage.setItem('invite', m[1] + ':' + m[2]); history.replaceState(null, '', '/'); }

  const savedLang = localStorage.getItem('lang');
  setLang(LANGS.some((l) => l.code === savedLang) ? savedLang : S.token ? 'fa' : null);
  applyStaticI18n(); applySettings(); fillChrome(); bindAuth(); bindEvents();
  $('#appName').textContent = S.appName || t('app_name');
  $('#authLang').innerHTML = ic('globe', 16) + `<span>${esc(LANG_META().name)}</span>`;

  if (!S.token) {
    if (!savedLang) await showLangPick();
    showScreen('auth');
    return;
  }
  try { await boot(); } catch (e) { if (!S.token) return; showScreen('auth'); }
}
init();
