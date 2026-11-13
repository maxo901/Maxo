'use strict';
/* =====================================================================
   UI layer: preferences/themes/wallpaper, slide-in panels (no dialogs),
   main menu, settings, profiles, chat info, users, groups, invites.
   ===================================================================== */

/* ---------- preferences ---------- */
const PREF_DEF = { theme: 'auto', accent: '', font: 100, radius: 16, wall: 'none', wallImg: '', blur: 0, dim: 0, anim: true, enter: true };
let _prefs = null;
function prefs() {
  if (!_prefs) { try { _prefs = { ...PREF_DEF, ...JSON.parse(localStorage.getItem('prefs') || '{}') }; } catch { _prefs = { ...PREF_DEF }; } }
  return _prefs;
}
function setPref(k, v) {
  prefs()[k] = v;
  try { localStorage.setItem('prefs', JSON.stringify(prefs())); } catch { toast(t('err_generic'), 'err'); }
  applyPrefs();
}

const THEMES = {
  auto: ['#ffffff', '#17212b'], light: ['#ffffff', '#3390ec'], dark: ['#17212b', '#5eb5f7'], midnight: ['#0a0a12', '#8b7bff'],
  ocean: ['#e6f4f9', '#0e8fb8'], forest: ['#e9f3ea', '#2e8b57'], sunset: ['#fff1e6', '#f0662d'], rose: ['#fdeef3', '#e0457b'], violet: ['#f1ebfb', '#7a4dd8'],
};
const ACCENTS = ['#3390ec', '#e0457b', '#f0662d', '#2e8b57', '#7a4dd8', '#0e8fb8', '#d4a017', '#e5484d'];
const WALLS = {
  none: '', g1: 'linear-gradient(135deg,#a8edea,#fed6e3)', g2: 'linear-gradient(135deg,#667eea,#764ba2)', g3: 'linear-gradient(160deg,#0f2027,#2c5364)',
  g4: 'linear-gradient(135deg,#f6d365,#fda085)', g5: 'linear-gradient(135deg,#d4fc79,#96e6a1)', g6: 'radial-gradient(circle at 20% 20%,#ff9a9e,#fad0c4 50%,#a1c4fd)',
  dots: 'radial-gradient(rgba(127,127,127,.3) 1.6px,transparent 1.6px) 0 0/22px 22px',
};

const resolveTheme = () => (prefs().theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : prefs().theme);
const isDarkTheme = () => ['dark', 'midnight'].includes(resolveTheme());

function readableOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? '#0b1722' : '#ffffff';
}

function applyPrefs() {
  const p = prefs(), root = document.documentElement;
  root.dataset.theme = resolveTheme();
  root.dataset.anim = p.anim ? 'on' : 'off';
  root.style.setProperty('--fs', p.font / 100);
  root.style.setProperty('--br', p.radius + 'px');
  if (p.accent) { root.style.setProperty('--accent', p.accent); root.style.setProperty('--accent-text', readableOn(p.accent)); }
  else { root.style.removeProperty('--accent'); root.style.removeProperty('--accent-text'); }
  const w = $('#wall');
  if (w) {
    const bg = p.wall === 'custom' && p.wallImg ? `url(${p.wallImg}) center/cover` : WALLS[p.wall] || '';
    w.style.background = bg;
    w.style.setProperty('--blur', p.blur + 'px');
    w.style.setProperty('--dim', p.dim / 100);
    w.classList.toggle('on', !!bg);
  }
  const m = $('meta[name=theme-color]');
  if (m) m.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#fff';
  const b = $('#themeAuth');
  if (b) b.innerHTML = ic(isDarkTheme() ? 'sun' : 'moon');
}
const toggleTheme = () => setPref('theme', isDarkTheme() ? 'light' : 'dark');

/* ---------- panels ---------- */
S.panels = [];
function openPanel(host, { title = '', html = '', actions = '', kind = '', chatId = 0 } = {}) {
  const parent = host === 'info' ? $('#chatPane') : $('#sidebar');
  const el = document.createElement('div');
  el.className = 'panel ' + host;
  el.innerHTML = `<header class="p-head"><button class="icon-btn" type="button" data-pclose>${ic(host === 'info' ? 'x' : 'back')}</button><h2></h2><span class="grow"></span>${actions}</header><div class="p-body">${html}</div>`;
  $('h2', el).textContent = title;
  parent.append(el);
  const p = {
    el, host, kind, chatId, body: $('.p-body', el),
    setTitle: (x) => ($('h2', el).textContent = x),
    close() {
      if (!el.isConnected) return;
      S.panels = S.panels.filter((x) => x !== p);
      el.classList.remove('in');
      setTimeout(() => el.remove(), prefs().anim ? 280 : 0);
      if (p.onClose) p.onClose();
    },
  };
  $('[data-pclose]', el).onclick = () => p.close();
  S.panels.push(p);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
  return p;
}
function closeAllPanels(host) { [...S.panels].filter((p) => !host || p.host === host).forEach((p) => p.close()); }

/* ---------- small building blocks ---------- */
const sw = (id, label, on, hint = '') => `<label class="sw"><span class="sw-t">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i></i></label>`;
const row = (icon, label, id, extra = '') => `<button type="button" class="m-row" id="${id}">${ic(icon, 20)}<span>${esc(label)}</span>${extra}${ic('chev', 16)}</button>`;

function resizeImage(file, max = 320, quality = 0.88) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error(t('err_generic')))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('err_generic'))); };
    img.src = url;
  });
}

async function postAvatar(path, file) {
  const fd = new FormData();
  fd.append('file', await resizeImage(file), 'avatar.jpg');
  const r = await fetch('/api' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + S.token }, body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(terr(d.error));
  return d;
}

function applyMe(u) { Object.assign(S.me, u); S.users.set(u.id, { ...(userOf(u.id) || {}), ...u }); }

/* ---------- main menu ---------- */
function openMainMenu(e) {
  const r = e.currentTarget.getBoundingClientRect();
  const me = S.me;
  const dark = isDarkTheme();
  const saved = [...S.chats.values()].find((c) => c.type === 'saved');
  popup(`<div class="pm-head">${avatar(me, 42)}<div><b>${esc(me.display_name)}</b><span class="muted" dir="ltr">@${esc(me.username)}</span></div></div><div class="sep"></div>
    ${saved ? `<button type="button" data-act="saved">${ic('bookmark', 18)}${esc(t('saved'))}</button>` : ''}
    <button type="button" data-act="users">${ic('users', 18)}${esc(t('users'))}</button>
    <button type="button" data-act="group">${ic('users', 18)}${esc(t('new_group'))}</button>
    <button type="button" data-act="channel">${ic('mega', 18)}${esc(t('new_channel'))}</button>
    <button type="button" data-act="settings">${ic('gear', 18)}${esc(t('settings'))}</button>
    <button type="button" data-act="theme">${ic(dark ? 'sun' : 'moon', 18)}${esc(dark ? t('day') : t('night'))}</button>
    <div class="sep"></div><button type="button" class="danger" data-act="logout">${ic('logout', 18)}${esc(t('logout'))}</button>`,
    r.left, r.bottom + 6, (d) => {
      if (d.act === 'saved' && saved) openChat(saved.id);
      if (d.act === 'users') openUsersPanel('side');
      if (d.act === 'group') openGroupForm('group');
      if (d.act === 'channel') openGroupForm('channel');
      if (d.act === 'settings') openSettings();
      if (d.act === 'theme') toggleTheme();
      if (d.act === 'logout') logout(false);
    });
}

/* ---------- settings ---------- */
function openSettings() {
  const p = openPanel('side', { title: t('settings'), kind: 'settings' });
  const draw = () => {
    const pr = prefs(), me = S.me;
    p.setTitle(t('settings'));
    p.body.innerHTML = `
      <button type="button" class="s-profile" id="sProf">${avatar(me, 64)}<div><b>${esc(me.display_name)}</b><span class="muted" dir="ltr">@${esc(me.username)}</span>${me.bio ? `<small>${esc(me.bio)}</small>` : ''}</div>${ic('chev', 18)}</button>

      <h3 class="s-h">${esc(t('appearance'))}</h3>
      <div class="s-card">
        <div class="s-label">${esc(t('theme'))}</div>
        <div class="theme-grid">${Object.entries(THEMES).map(([k, [a, b]]) => `<button type="button" class="th${pr.theme === k ? ' on' : ''}" data-theme-pick="${k}"><i style="background:linear-gradient(135deg,${a} 50%,${b} 50%)"></i><span>${esc(t('th_' + k))}</span></button>`).join('')}</div>
        <div class="s-label">${esc(t('accent'))}</div>
        <div class="acc-row">${ACCENTS.map((c) => `<button type="button" class="acc${pr.accent === c ? ' on' : ''}" data-acc="${c}" style="background:${c}"></button>`).join('')}
          <label class="acc custom" title="${esc(t('color'))}"><input type="color" id="sAcc" value="${pr.accent || '#3390ec'}"></label>
          <button type="button" class="acc reset" data-acc="">${ic('x', 14)}</button></div>
        <div class="s-label">${esc(t('text_size'))} <b id="vFont">${pr.font}%</b></div>
        <input type="range" id="sFont" min="80" max="140" step="5" value="${pr.font}">
        <div class="s-label">${esc(t('bubble_radius'))} <b id="vRad">${pr.radius}</b></div>
        <input type="range" id="sRad" min="4" max="26" value="${pr.radius}">
        <div class="s-label">${esc(t('wallpaper'))}</div>
        <div class="wall-grid">${Object.keys(WALLS).map((k) => `<button type="button" class="wp${pr.wall === k ? ' on' : ''}" data-wall="${k}" style="background:${WALLS[k] || 'var(--bg2)'}">${k === 'none' ? ic('x', 16) : ''}</button>`).join('')}
          <button type="button" class="wp custom${pr.wall === 'custom' ? ' on' : ''}" id="wpUp" ${pr.wallImg ? `style="background:url(${pr.wallImg}) center/cover"` : ''}>${ic('camera', 18)}</button></div>
        <input type="file" id="wpFile" accept="image/*" hidden>
        <div class="s-label">${esc(t('wp_blur'))} <b id="vBlur">${pr.blur}</b></div><input type="range" id="sBlur" min="0" max="14" value="${pr.blur}">
        <div class="s-label">${esc(t('wp_dim'))} <b id="vDim">${pr.dim}%</b></div><input type="range" id="sDim" min="0" max="70" value="${pr.dim}">
        ${sw('sAnim', t('animations'), pr.anim)}
        <button type="button" class="btn ghost small" id="sReset">${esc(t('reset_look'))}</button>
      </div>

      <h3 class="s-h">${esc(t('language'))}</h3>
      <div class="s-card lang-list">${LANGS.map((l) => `<button type="button" class="lang-opt${LANG === l.c ? ' on' : ''}" data-lang="${l.c}">${esc(l.n)}${LANG === l.c ? ic('check', 16) : ''}</button>`).join('')}</div>

      <h3 class="s-h">${esc(t('privacy'))}</h3>
      <div class="s-card">${sw('sOnline', t('show_online'), me.show_online !== false, t('show_online_hint'))}</div>

      <h3 class="s-h">${esc(t('security'))}</h3>
      <div class="s-card">${row('lock', t('change_password'), 'sPw')}</div>

      <h3 class="s-h">${esc(t('account'))}</h3>
      <div class="s-card">
        <button type="button" class="m-row danger" id="sOut">${ic('logout', 20)}<span>${esc(t('logout'))}</span></button>
        ${me.role === 'owner' ? '' : `<div class="s-label">${esc(t('delete_hint'))}</div>
        <input class="inp" id="sDelPw" type="password" dir="ltr" autocomplete="current-password">
        <button type="button" class="btn danger" id="sDel">${ic('trash', 18)}<span>${esc(t('delete_account'))}</span></button>`}
      </div>`;

    $('#sProf', p.body).onclick = openEditProfile;
    $$('[data-theme-pick]', p.body).forEach((b) => (b.onclick = () => { setPref('theme', b.dataset.themePick); $$('.th', p.body).forEach((x) => x.classList.toggle('on', x === b)); }));
    $$('[data-acc]', p.body).forEach((b) => (b.onclick = () => { setPref('accent', b.dataset.acc); $$('.acc[data-acc]', p.body).forEach((x) => x.classList.toggle('on', x === b)); }));
    $('#sAcc', p.body).oninput = (e) => setPref('accent', e.target.value);
    const range = (id, key, label, fmt = (v) => v) => ($(id, p.body).oninput = (e) => { setPref(key, +e.target.value); $(label, p.body).textContent = fmt(e.target.value); });
    range('#sFont', 'font', '#vFont', (v) => v + '%'); range('#sRad', 'radius', '#vRad'); range('#sBlur', 'blur', '#vBlur'); range('#sDim', 'dim', '#vDim', (v) => v + '%');
    $$('[data-wall]', p.body).forEach((b) => (b.onclick = () => { setPref('wall', b.dataset.wall); $$('.wp', p.body).forEach((x) => x.classList.toggle('on', x === b)); }));
    $('#wpUp', p.body).onclick = () => $('#wpFile', p.body).click();
    $('#wpFile', p.body).onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const blob = await resizeImage(f, 1280, 0.72);
        const data = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
        prefs().wallImg = data; setPref('wall', 'custom'); draw();
      } catch (err) { toast(err.message, 'err'); }
    };
    $('#sAnim', p.body).onchange = (e) => setPref('anim', e.target.checked);
    $('#sReset', p.body).onclick = () => { _prefs = { ...PREF_DEF }; localStorage.removeItem('prefs'); applyPrefs(); draw(); };

    $$('[data-lang]', p.body).forEach((b) => (b.onclick = () => {
      setLang(b.dataset.lang);
      renderChatList(); renderStories(); renderOnline(); syncSend();
      if (S.activeId) { renderHead(); syncComposerState(); renderAllMessages('keep'); }
      draw();
    }));
    $('#sOnline', p.body).onchange = async (e) => {
      try { applyMe(await api('/me', { method: 'PATCH', body: { show_online: e.target.checked } })); } catch (err) { toast(err.message, 'err'); e.target.checked = !e.target.checked; }
    };
    $('#sPw', p.body).onclick = openPasswordPanel;
    $('#sOut', p.body).onclick = () => logout(false);
    const del = $('#sDel', p.body);
    if (del) armConfirm(del, async () => {
      try { await api('/me', { method: 'DELETE', body: { password: $('#sDelPw', p.body).value } }); logout(false); } catch (err) { toast(err.message, 'err'); }
    });
  };
  p.redraw = draw;
  draw();
}

function openEditProfile() {
  const p = openPanel('side', { title: t('edit_profile'), kind: 'profile' });
  const draw = () => {
    const me = S.me;
    p.body.innerHTML = `<div class="av-edit">${avatar(me, 104)}
        <div class="av-actions"><button class="btn small ghost" type="button" id="pPick">${ic('camera', 16)}<span>${esc(t('change_photo'))}</span></button>${me.avatar ? `<button class="btn small ghost danger-t" type="button" id="pDel">${esc(t('remove_photo'))}</button>` : ''}</div>
        <input type="file" id="pFile" accept="image/*" hidden></div>
      <div class="s-card">
        <label class="field"><span>${esc(t('display_name'))}</span><input class="inp" id="pName" maxlength="40" value="${esc(me.display_name)}"></label>
        <label class="field"><span>${esc(t('bio'))}</span><textarea class="inp" id="pBio" maxlength="160" rows="3">${esc(me.bio)}</textarea></label>
        <div class="kv"><span>${esc(t('username'))}</span><b dir="ltr">@${esc(me.username)}</b></div>
        <button class="btn" type="button" id="pSave">${esc(t('save'))}</button></div>`;
    $('#pPick', p.body).onclick = () => $('#pFile', p.body).click();
    $('#pFile', p.body).onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { applyMe(await postAvatar('/me/avatar', f)); draw(); renderChatList(); } catch (err) { toast(err.message, 'err'); }
    };
    const del = $('#pDel', p.body);
    if (del) del.onclick = async () => { try { applyMe(await api('/me/avatar', { method: 'DELETE' })); draw(); } catch (err) { toast(err.message, 'err'); } };
    $('#pSave', p.body).onclick = async () => {
      try { applyMe(await api('/me', { method: 'PATCH', body: { display_name: $('#pName', p.body).value, bio: $('#pBio', p.body).value } })); toast(t('saved_changes')); p.close(); const s = S.panels.find((x) => x.kind === 'settings'); if (s) s.redraw(); renderChatList(); }
      catch (err) { toast(err.message, 'err'); }
    };
  };
  draw();
}

function openPasswordPanel() {
  const p = openPanel('side', { title: t('change_password'), html: `<div class="s-card">
    <label class="field"><span>${esc(t('current_pw'))}</span><input class="inp" id="wCur" type="password" dir="ltr" autocomplete="current-password"></label>
    <label class="field"><span>${esc(t('new_pw'))}</span><input class="inp" id="wNew" type="password" dir="ltr" autocomplete="new-password"><small class="hint">${esc(t('pwd_hint'))}</small></label>
    <button class="btn" type="button" id="wSave">${esc(t('save'))}</button></div>` });
  $('#wSave', p.body).onclick = async () => {
    try { await api('/me/password', { method: 'POST', body: { current: $('#wCur', p.body).value, next: $('#wNew', p.body).value } }); toast(t('pw_changed')); p.close(); }
    catch (err) { toast(err.message, 'err'); }
  };
}

/* ---------- users ---------- */
function openUsersPanel(host, forNew = false) {
  const p = openPanel(host, { title: forNew ? t('new_chat') : t('users') });
  p.body.innerHTML = `<div class="p-search"><input class="inp" id="uSearch" type="search" placeholder="${esc(t('search'))}" autocomplete="off"></div>
    ${forNew ? `<div class="quick">${row('users', t('new_group'), 'qGroup')}${row('mega', t('new_channel'), 'qChannel')}</div>` : ''}<div id="uList"></div>`;
  const draw = () => {
    const q = $('#uSearch', p.body).value.trim().toLowerCase();
    const list = [...S.users.values()].filter((u) => u.id !== S.me.id && visibleUser(u) && (!q || u.display_name.toLowerCase().includes(q) || u.username.includes(q)))
      .sort((a, b) => (S.online.has(b.id) - S.online.has(a.id)) || a.display_name.localeCompare(b.display_name, LANG));
    $('#uList', p.body).innerHTML = list.map((u) => `<div class="ci" data-uid="${u.id}">${avatar(u, 46, { dot: S.online.has(u.id) })}
      <div class="ci-main"><div class="ci-title">${esc(u.display_name)}${badges(u)}</div><div class="ci-sub">${esc(seenText(u))}</div></div>
      <button type="button" class="icon-btn" data-profile="${u.id}">${ic('info', 20)}</button></div>`).join('') || `<div class="empty-list">—</div>`;
  };
  $('#uSearch', p.body).oninput = draw;
  $('#uList', p.body).onclick = (e) => {
    const inf = e.target.closest('[data-profile]');
    if (inf) return openProfile(+inf.dataset.profile, host);
    const r = e.target.closest('[data-uid]');
    if (r) openDM(+r.dataset.uid);
  };
  if (forNew) { $('#qGroup', p.body).onclick = () => openGroupForm('group'); $('#qChannel', p.body).onclick = () => openGroupForm('channel'); }
  draw();
}

/* ---------- shared media block (profiles + chat info) ---------- */
function mediaSection(chatId) {
  const el = document.createElement('div');
  el.className = 'media-sec';
  el.innerHTML = `<h3 class="s-h">${esc(t('shared'))}</h3><div class="m-tabs"><button type="button" class="on" data-k="media">${esc(t('media'))}</button><button type="button" data-k="files">${esc(t('files'))}</button><button type="button" data-k="voice">${esc(t('voice'))}</button></div><div class="m-grid"></div>`;
  const grid = $('.m-grid', el);
  const load = async (k) => {
    grid.className = 'm-grid ' + k; grid.innerHTML = '';
    try {
      const { messages } = await api(`/chats/${chatId}/media?type=${k}`);
      grid.innerHTML = messages.map((m) => {
        const u = esc(m.file.url);
        if (k === 'media') return m.type === 'image' ? `<button type="button" class="thumb" data-lb="${u}" style="background-image:url(${u})"></button>` : `<a class="thumb vid" href="${u}" target="_blank" rel="noopener"><video src="${u}#t=0.1" preload="metadata" muted></video>${ic('play', 22)}</a>`;
        if (k === 'files') return `<a class="file" href="${u}" download="${esc(m.file.name || 'file')}" target="_blank" rel="noopener"><span class="fi">${ic('file', 20)}</span><span><b>${esc(m.file.name || 'file')}</b><small>${fsize(m.file.size || 0)}</small></span></a>`;
        return `<audio controls preload="none" src="${u}"></audio>`;
      }).join('') || `<div class="empty-list">${esc(t('no_media'))}</div>`;
    } catch (e) { grid.innerHTML = `<div class="empty-list">${esc(e.message)}</div>`; }
  };
  $('.m-tabs', el).onclick = (e) => { const b = e.target.closest('[data-k]'); if (!b) return; $$('.m-tabs button', el).forEach((x) => x.classList.toggle('on', x === b)); load(b.dataset.k); };
  grid.onclick = (e) => { const lb = e.target.closest('[data-lb]'); if (lb) { $('#lbImg').src = lb.dataset.lb; $('#lightbox').classList.remove('hidden'); } };
  load('media');
  return el;
}

/* ---------- user profile ---------- */
async function openProfile(uid, host = 'side') {
  const u = userOf(uid);
  if (!u) return;
  if (uid === S.me.id) return openEditProfile();
  const dm = [...S.chats.values()].find((c) => c.type === 'dm' && c.peer.id === uid);
  const p = openPanel(host, { title: t('info'), kind: 'profile' });
  const draw = () => {
    const x = userOf(uid) || u;
    p.body.innerHTML = `<div class="prof">${avatar(x, 104, { dot: S.online.has(uid) })}<h2>${esc(x.display_name)}${badges(x)}</h2>
      <div class="status${S.online.has(uid) ? ' on' : ''}">${esc(seenText(x))}</div></div>
      <div class="s-card">
        ${x.bio ? `<div class="kv col"><span>${esc(t('bio'))}</span><b dir="auto">${esc(x.bio)}</b></div>` : ''}
        <div class="kv"><span>${esc(t('username'))}</span><b dir="ltr">@${esc(x.username)}</b></div>
        ${x.created_at ? `<div class="kv"><span>${esc(t('joined', { d: '' }).trim())}</span><b>${esc(df.format(x.created_at))}</b></div>` : ''}
      </div>
      <div class="s-card">${x.banned ? '' : `<button class="btn" type="button" id="prDm">${ic('send', 18)}<span>${esc(t('send_message'))}</span></button>`}
        ${isOwner() && x.role !== 'owner' ? `<button class="btn ghost ${x.banned ? '' : 'danger-t'}" type="button" id="prBan">${esc(x.banned ? t('unban') : t('ban'))}</button>` : ''}</div>`;
    if (dm) p.body.append(mediaSection(dm.id));
    const b = $('#prDm', p.body);
    if (b) b.onclick = () => openDM(uid);
    const ban = $('#prBan', p.body);
    if (ban) armConfirm(ban, async () => {
      try { const r = await api(`/users/${uid}/ban`, { method: 'POST', body: { banned: !x.banned } }); S.users.set(uid, { ...x, ...r.user }); draw(); renderChatList(); renderOnline(); } catch (e) { toast(e.message, 'err'); }
    });
  };
  p.redraw = draw;
  draw();
}

/* ---------- chat info (groups / channels / saved / dm) ---------- */
function refreshInfoPanel() { const p = S.panels.find((x) => x.kind === 'chatinfo' && x.chatId === S.activeId); if (p) p.redraw(); }

function inviteUrl(c) { return `${location.origin}/${c.type === 'channel' ? 'c' : 'g'}/${c.invite_code}`; }

function openChatInfo() {
  const c = S.chats.get(S.activeId);
  if (!c) return;
  if (c.type === 'dm') return openProfile(c.peer.id, 'info');
  const p = openPanel('info', { title: t('info'), kind: 'chatinfo', chatId: c.id });
  const mine = c.created_by === S.me.id;

  const draw = async () => {
    const cc = S.chats.get(c.id);
    if (!cc) return p.close();
    const saved = cc.type === 'saved';
    p.body.innerHTML = `<div class="prof">${chatAvatar(cc, 104)}<h2>${esc(chatTitle(cc))}</h2>
        <div class="status">${saved ? '' : esc(cc.type === 'channel' ? t('channel_tag') : t('group_tag'))}${saved ? '' : ' · ' + esc(t('members_n', { n: fnum(cc.members_count || 1) }))}</div></div>
      ${!saved && mine ? `<div class="s-card">
        <div class="av-actions"><button class="btn small ghost" type="button" id="gPick">${ic('camera', 16)}<span>${esc(t('change_photo'))}</span></button>${cc.avatar ? `<button class="btn small ghost danger-t" type="button" id="gDelAv">${esc(t('remove_photo'))}</button>` : ''}</div>
        <input type="file" id="gFile" accept="image/*" hidden>
        <label class="field"><span>${esc(t('name'))}</span><input class="inp" id="gTitle" maxlength="60" value="${esc(cc.title)}"></label>
        <label class="field"><span>${esc(t('description'))}</span><textarea class="inp" id="gDesc" maxlength="200" rows="2">${esc(cc.description)}</textarea></label>
        ${cc.type === 'group' ? sw('gClosed', t('close_group'), cc.closed) : ''}
        <button class="btn" type="button" id="gSave">${esc(t('save'))}</button></div>` : !saved && cc.description ? `<div class="s-card"><div class="kv col"><span>${esc(t('description'))}</span><b dir="auto">${esc(cc.description)}</b></div></div>` : ''}
      ${!saved && mine && cc.invite_code ? `<div class="s-card"><div class="s-label">${esc(t('invite_link'))}</div>
        <div class="link-box" dir="ltr">${esc(inviteUrl(cc))}</div>
        <div class="av-actions"><button class="btn small" type="button" id="gCopy">${ic('copy', 16)}<span>${esc(t('copy_link'))}</span></button><button class="btn small ghost" type="button" id="gReset">${esc(t('reset_link'))}</button></div></div>` : ''}
      <div id="memBox"></div><div id="mediaBox"></div>
      <div class="s-card">
        <div class="s-label">${esc(t('clear_history'))}</div>
        <button type="button" class="btn ghost danger-t" id="gClrMe">${ic('trash', 18)}<span>${esc(t('clear_me'))}</span></button>
        ${saved || cc.type === 'dm' || mine ? `<button type="button" class="btn ghost danger-t" id="gClrAll">${ic('trash', 18)}<span>${esc(t('clear_both'))}</span></button>` : ''}
        ${!saved && !mine ? (cc.forced ? `<small class="hint">${esc(t('cannot_leave'))}</small>` : `<button type="button" class="btn ghost danger-t" id="gLeave">${ic('logout', 18)}<span>${esc(t('leave'))}</span></button>`) : ''}
        ${!saved && mine ? `<button type="button" class="btn danger" id="gDelete">${ic('trash', 18)}<span>${esc(t('delete_chat'))}</span></button>` : ''}
      </div>`;

    const act = (id, fn) => { const b = $(id, p.body); if (b) b.onclick = fn; };
    const safe = (fn) => async () => { try { await fn(); } catch (e) { toast(e.message, 'err'); } };
    const upd = (r) => { S.chats.set(c.id, { ...S.chats.get(c.id), ...r.chat }); renderChatList(); renderHead(); draw(); };

    act('#gPick', () => $('#gFile', p.body).click());
    const gf = $('#gFile', p.body);
    if (gf) gf.onchange = safe(async () => { const f = gf.files[0]; if (f) upd(await postAvatar(`/chats/${c.id}/avatar`, f)); });
    act('#gDelAv', safe(async () => upd(await api(`/chats/${c.id}/avatar`, { method: 'DELETE' }))));
    act('#gSave', safe(async () => {
      const body = { title: $('#gTitle', p.body).value, description: $('#gDesc', p.body).value };
      const cl = $('#gClosed', p.body);
      if (cl) body.closed = cl.checked;
      upd(await api(`/chats/${c.id}`, { method: 'PATCH', body })); toast(t('saved_changes'));
    }));
    act('#gCopy', safe(async () => { await navigator.clipboard.writeText(inviteUrl(S.chats.get(c.id))); toast(t('link_copied')); }));
    act('#gReset', safe(async () => upd(await api(`/chats/${c.id}/invite/reset`, { method: 'POST' }))));

    const clear = (both) => safe(async () => { await api(`/chats/${c.id}/clear`, { method: 'POST', body: { both } }); toast(t('cleared')); });
    const me = $('#gClrMe', p.body); if (me) armConfirm(me, clear(false));
    const all = $('#gClrAll', p.body); if (all) armConfirm(all, clear(true));
    const lv = $('#gLeave', p.body); if (lv) armConfirm(lv, safe(async () => { await api(`/chats/${c.id}/leave`, { method: 'POST' }); }));
    const dl = $('#gDelete', p.body); if (dl) armConfirm(dl, safe(async () => { await api(`/chats/${c.id}`, { method: 'DELETE' }); }));

    $('#mediaBox', p.body).append(mediaSection(c.id));
    if (!saved) {
      try {
        const { members } = await api(`/chats/${c.id}/members`);
        members.forEach((m) => S.users.set(m.id, { ...(userOf(m.id) || {}), ...m }));
        const box = $('#memBox', p.body);
        if (!box) return;
        box.innerHTML = `<h3 class="s-h">${esc(t('members'))} · ${fnum(members.length)}</h3><div class="s-card flush">${members.map((m) => `<div class="ci" data-mem="${m.id}">${avatar(m, 42, { dot: S.online.has(m.id) })}<div class="ci-main"><div class="ci-title">${esc(m.display_name)}${m.member_role === 'owner' ? `<span class="tag">${esc(t('owner_tag'))}</span>` : ''}</div><div class="ci-sub">${esc(m.id === S.me.id ? t('you') : seenText(m))}</div></div></div>`).join('')}</div>`;
        box.onclick = (e) => { const r = e.target.closest('[data-mem]'); if (!r) return; const id = +r.dataset.mem; id === S.me.id ? openEditProfile() : openProfile(id, 'info'); };
      } catch { /* ignore */ }
    }
  };
  p.redraw = draw;
  draw();
}

/* ---------- create group / channel ---------- */
function openGroupForm(type) {
  const isCh = type === 'channel';
  const p = openPanel('side', { title: t(isCh ? 'new_channel' : 'new_group'), html: `<div class="s-card">
    <label class="field"><span>${esc(t('name'))}</span><input class="inp" id="nTitle" maxlength="60"></label>
    <label class="field"><span>${esc(t('description'))}</span><textarea class="inp" id="nDesc" maxlength="200" rows="3"></textarea></label>
    <button class="btn" type="button" id="nGo">${esc(t('create'))}</button></div>` });
  $('#nTitle', p.body).focus();
  $('#nGo', p.body).onclick = async () => {
    try {
      const r = await api('/chats', { method: 'POST', body: { type, title: $('#nTitle', p.body).value, description: $('#nDesc', p.body).value } });
      S.chats.set(r.chat.id, r.chat);
      closeAllPanels('side');
      openChat(r.chat.id);
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* ---------- invite links ---------- */
async function handleInvite() {
  const inv = S.pendingInvite;
  S.pendingInvite = null;
  if (!inv) return;
  try {
    const r = await api(`/invite/${inv.kind}/${inv.code}`);
    if (r.joined && r.chat.id) return openChat(r.chat.id);
    const info = r.chat;
    if (isMobile() && !S.pushed) { history.pushState({ chat: 1 }, ''); S.pushed = true; }
    const v = $('#joinView');
    v.innerHTML = `<div class="join-card">${avatar({ id: info.id || inv.code.length, display_name: info.title, avatar: info.avatar }, 104)}
      <h2>${esc(info.title)}</h2><div class="status">${esc(t(info.type === 'channel' ? 'channel_tag' : 'group_tag'))} · ${esc(t('members_n', { n: fnum(info.members_count || 0) }))}</div>
      ${info.description ? `<p dir="auto">${esc(info.description)}</p>` : ''}
      <button class="btn" type="button" id="joinBtn">${esc(t(info.type === 'channel' ? 'join_channel' : 'join_group'))}</button></div>`;
    $('#app').classList.add('chat-open');
    $('#emptyState').classList.add('hidden'); $('#chatView').classList.add('hidden');
    v.classList.remove('hidden');
    $('#joinBtn', v).onclick = async () => {
      try {
        const j = await api(`/invite/${inv.kind}/${inv.code}/join`, { method: 'POST' });
        S.chats.set(j.chat.id, j.chat);
        openChat(j.chat.id);
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { toast(e.message, 'err'); }
}
