'use strict';
/* =====================================================================
   panels.js — settings, appearance, privacy, language, profile, contacts,
   new group/channel, group info, forward, invite join
   ===================================================================== */

const item = (icon, label, { val = '', sub = '', cls = '', go = '', extra = '' } = {}) =>
  `<button type="button" class="item ${cls}" ${go ? `data-go="${go}"` : ''} ${extra}><span class="ico">${icon ? ic(icon, 22) : ''}</span><span class="lbl">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>${val !== '' ? `<span class="val">${val}</span>` : ''}</button>`;
const sw = (on) => `<span class="switch ${on ? 'on' : ''}"></span>`;

async function openDM(uid) {
  if (uid === S.me.id) { const c = S.chats.find((x) => x.saved); if (c) { closeAllPanels(); openChat(c.id); } return; }
  try {
    const d = await api('/chats/dm', { method: 'POST', body: { user_id: uid } });
    upsertChat(d.chat);
    closeAllPanels();
    renderList();
    openChat(d.chat.id);
  } catch (e) { toast(e.message, true); }
}

/* ---------------- settings ---------------- */
function openSettings() {
  openPanel((p) => {
    p.setTitle(t('settings'));
    const me = S.me;
    const th = THEMES.find((x) => x.id === S.set.theme);
    p.body.innerHTML = `<div class="prof" style="cursor:pointer" data-go="edit">${avatar(me, 96)}<h2>${esc(me.display_name)}</h2><div class="st">@${esc(me.username)}</div>${me.bio ? `<div class="bio">${esc(me.bio)}</div>` : ''}</div>
      <div class="card">${item('user', t('edit_profile'), { go: 'edit' })}${item('drop', t('appearance'), { go: 'appearance' })}${item('lock', t('privacy'), { go: 'privacy' })}${item('globe', t('language'), { go: 'language', val: esc(LANG_META().name) })}${item('bookmark', t('saved'), { go: 'saved' })}</div>
      <div class="card">${item('logout', t('logout'), { cls: 'danger', go: 'logout' })}</div>`;
    p.body.onclick = (e) => {
      const g = e.target.closest('[data-go]')?.dataset.go;
      if (g === 'edit') openEditProfile();
      else if (g === 'appearance') openAppearance();
      else if (g === 'privacy') openPrivacy();
      else if (g === 'language') openLanguage();
      else if (g === 'saved') { const c = S.chats.find((x) => x.saved); if (c) { closeAllPanels(); openChat(c.id); } }
    };
    armButton($('[data-go=logout]', p.body), doLogout);
  });
}

function openEditProfile() {
  openPanel((p) => {
    p.setTitle(t('edit_profile'));
    const me = S.me;
    p.body.innerHTML = `<div class="prof"><div class="avedit">${avatar(me, 110)}<button class="cam" type="button" data-cam>${ic('camera', 18)}</button></div>
      ${me.avatar ? `<div><button class="btn danger" type="button" data-rmav style="margin-top:12px;min-height:36px">${esc(t('remove_photo'))}</button></div>` : ''}</div>
      <div class="card"><div class="pad"><label class="field"><span>${esc(t('auth.display_name'))}</span><input id="pfName" maxlength="40" value="${esc(me.display_name)}"></label>
      <label class="field"><span>${esc(t('bio'))}</span><textarea id="pfBio" maxlength="160">${esc(me.bio || '')}</textarea></label>
      <div class="field"><span>${esc(t('auth.username'))}</span><div class="input" dir="ltr" style="display:flex;align-items:center;opacity:.7">@${esc(me.username)}</div></div>
      <div class="err" id="pfErr"></div><button class="btn block" type="button" id="pfSave">${esc(t('save'))}</button></div></div>`;
    $('[data-cam]', p.body).onclick = async () => {
      const f = await pickFile($('#fileOne'), 'image/*'); if (!f) return;
      try {
        const blob = await resizeImage(f, { max: 512, square: true });
        const fd = new FormData(); fd.append('file', blob, 'avatar.jpg');
        S.me = { ...S.me, ...(await api('/me/avatar', { method: 'POST', form: fd })) };
        S.users.set(S.me.id, { ...S.me }); renderStoryBar(); refreshPanels(); renderList();
      } catch (e) { toast(e.message, true); }
    };
    const rm = $('[data-rmav]', p.body);
    rm && (rm.onclick = async () => { try { S.me = { ...S.me, ...(await api('/me/avatar', { method: 'DELETE' })) }; S.users.set(S.me.id, { ...S.me }); refreshPanels(); renderStoryBar(); } catch (e) { toast(e.message, true); } });
    $('#pfSave', p.body).onclick = async () => {
      try {
        S.me = { ...S.me, ...(await api('/me', { method: 'PATCH', body: { display_name: $('#pfName', p.body).value, bio: $('#pfBio', p.body).value } })) };
        S.users.set(S.me.id, { ...S.me }); toast(t('saved_ok')); renderStoryBar(); refreshPanels();
      } catch (e) { $('#pfErr', p.body).textContent = e.message; }
    };
  });
}

/* ---------------- appearance ---------------- */
function openAppearance() {
  openPanel((p) => {
    p.setTitle(t('appearance'));
    const s = S.set;
    const previewHTML = `<div class="preview"><div class="row first last"><div class="bwrap"><div class="bubble"><div class="btext">${esc(t('prev_in'))}</div><span class="meta">12:30</span></div></div></div>
      <div class="row mine first last"><div class="bwrap"><div class="bubble"><div class="btext">${esc(t('prev_out'))}</div><span class="meta">12:31<span class="ticks seen">${ic('checks', 15)}</span></span></div></div></div></div>`;
    const themes = THEMES.map((th) => `<button type="button" class="theme ${s.theme === th.id ? 'on' : ''}" data-theme="${th.id}"><span class="sw" style="background:${th.sw[0]}"><i class="a" style="background:${th.sw[1]}"></i><i class="b" style="background:${th.sw[2]}"></i></span><span>${esc(t('th_' + th.id))}</span></button>`).join('');
    const walls = WALLS.map((w) => `<button type="button" class="wall ${s.wp === w.id ? 'on' : ''}" data-wp="${w.id}" style="${w.css ? `background:${w.css}` : ''}">${w.id === 'theme' ? ic('drop', 20) : ''}</button>`).join('') +
      (S.me.wallpaper ? `<button type="button" class="wall ${s.wp === 'custom' ? 'on' : ''}" data-wp="custom" style="background-image:url('${esc(S.me.wallpaper)}')"></button>` : '') +
      `<button type="button" class="wall" data-wp-upload>${ic('image', 22)}</button>`;
    p.body.innerHTML = `${previewHTML}
      <div class="card"><h3>${esc(t('color_theme'))}</h3><div class="themes">${themes}</div></div>
      <div class="card"><h3>${esc(t('chat_bg'))}</h3><div class="walls">${walls}</div>
        ${item('', t('bg_pattern'), { go: 'pattern', val: sw(s.pattern) })}
        ${S.me.wallpaper ? item('trash', t('remove_custom_bg'), { go: 'rmwall', cls: 'danger' }) : ''}</div>
      <div class="card"><h3>${esc(t('text_size'))}</h3><div class="range"><div class="rl"><span>${esc(t('msg_text'))}</span><b id="vSize">${fnum(s.textSize)}</b></div><input type="range" min="12" max="24" value="${s.textSize}" data-r="textSize"></div>
        <div class="range"><div class="rl"><span>${esc(t('corner_radius'))}</span><b id="vRad">${fnum(s.radius)}</b></div><input type="range" min="0" max="24" value="${s.radius}" data-r="radius"></div></div>
      <div class="card">${item('', t('animations'), { go: 'anim', val: sw(s.anim), sub: t('animations_sub') })}</div>`;
    p.body.onclick = async (e) => {
      const th = e.target.closest('[data-theme]'), wp = e.target.closest('[data-wp]'), go = e.target.closest('[data-go]')?.dataset.go;
      if (th) { saveSet({ theme: th.dataset.theme }, { animate: true }); p.refresh(); }
      else if (wp) { saveSet({ wp: wp.dataset.wp }, { animate: true }); p.refresh(); }
      else if (e.target.closest('[data-wp-upload]')) {
        const f = await pickFile($('#fileOne'), 'image/*'); if (!f) return;
        try {
          const blob = await resizeImage(f, { max: 1600, quality: 0.85 });
          const fd = new FormData(); fd.append('file', blob, 'wall.jpg');
          S.me = { ...S.me, ...(await api('/me/wallpaper', { method: 'POST', form: fd })) };
          saveSet({ wp: 'custom' }, { animate: true }); p.refresh();
        } catch (er) { toast(er.message, true); }
      } else if (go === 'pattern') { saveSet({ pattern: !S.set.pattern }); p.refresh(); }
      else if (go === 'anim') { saveSet({ anim: !S.set.anim }); p.refresh(); }
      else if (go === 'rmwall') {
        try { S.me = { ...S.me, ...(await api('/me/wallpaper', { method: 'DELETE' })) }; saveSet({ wp: 'theme' }, { animate: true }); p.refresh(); } catch (er) { toast(er.message, true); }
      }
    };
    p.body.oninput = (e) => {
      const r = e.target.dataset.r;
      if (!r) return;
      const v = Number(e.target.value);
      saveSet({ [r]: v });
      $(r === 'textSize' ? '#vSize' : '#vRad', p.body).textContent = fnum(v);
    };
  });
}

/* ---------------- privacy + password ---------------- */
function openPrivacy() {
  openPanel((p) => {
    p.setTitle(t('privacy'));
    p.body.innerHTML = `<div class="card">${item('eye', t('show_online'), { go: 'online', val: sw(S.me.show_online), sub: t('show_online_sub') })}</div>
      <div class="card"><h3>${esc(t('change_password'))}</h3><div class="pad">
        <label class="field"><span>${esc(t('current_password'))}</span><input id="pwCur" type="password" autocomplete="current-password"></label>
        <label class="field"><span>${esc(t('new_password'))}</span><input id="pwNew" type="password" autocomplete="new-password" minlength="8"><div class="hint">${esc(t('auth.password_hint'))}</div></label>
        <label class="field"><span>${esc(t('repeat_password'))}</span><input id="pwRep" type="password" autocomplete="new-password"></label>
        <div class="err" id="pwErr"></div><button class="btn block" type="button" id="pwSave">${esc(t('change_password'))}</button></div></div>
      <div class="card"><h3>${esc(t('delete_account'))}</h3><div class="pad">${S.me.role === 'owner' ? `<div class="hint" style="color:var(--muted)">${esc(t('e.owner_no_delete'))}</div>` : `
        <label class="field"><span>${esc(t('current_password'))}</span><input id="dlPass" type="password" autocomplete="current-password"></label>
        <div class="err" id="dlErr"></div><button class="item danger" type="button" id="dlBtn" style="border-radius:12px;background:color-mix(in srgb,var(--danger) 10%,transparent)"><span class="ico">${ic('trash', 22)}</span><span class="lbl">${esc(t('delete_account'))}</span></button>`}</div></div>`;
    p.body.onclick = async (e) => {
      if (!e.target.closest('[data-go=online]')) return;
      const on = !S.me.show_online;
      try { S.me = { ...S.me, ...(await api('/me/settings', { method: 'PUT', body: { show_online: on } })) }; p.refresh(); } catch (er) { toast(er.message, true); }
    };
    $('#pwSave', p.body).onclick = async () => {
      const err = $('#pwErr', p.body); err.textContent = '';
      const nw = $('#pwNew', p.body).value;
      if (nw !== $('#pwRep', p.body).value) return (err.textContent = t('e.pw_mismatch'));
      try {
        const d = await api('/me/password', { method: 'PATCH', body: { current: $('#pwCur', p.body).value, password: nw } });
        S.token = d.token; localStorage.setItem('token', d.token);
        connectSocket();
        $$('input', p.body).forEach((i) => (i.value = ''));
        toast(t('password_changed'));
      } catch (er) { err.textContent = er.message; }
    };
    const dl = $('#dlBtn', p.body);
    dl && armButton(dl, async () => {
      try { await api('/me', { method: 'DELETE', body: { password: $('#dlPass', p.body).value } }); forceLogout(); } catch (er) { $('#dlErr', p.body).textContent = er.message; }
    });
  });
}

/* ---------------- language ---------------- */
function openLanguage() {
  openPanel((p) => {
    p.setTitle(t('language'));
    p.body.innerHTML = `<div class="card">${LANGS.map((l) => `<button type="button" class="item" data-l="${l.code}"><span class="ico" style="font-size:22px">${l.flag}</span><span class="lbl">${esc(l.name)}</span><span class="val" style="color:var(--accent)">${l.code === LANG ? ic('check', 20, 2.6) : ''}</span></button>`).join('')}</div>`;
    p.body.onclick = (e) => { const b = e.target.closest('[data-l]'); if (b && b.dataset.l !== LANG) setLanguage(b.dataset.l); };
  });
}

/* ---------------- contacts (tap = open private chat) ---------------- */
function openContacts() {
  openPanel((p) => {
    p.setTitle(t('contacts'));
    p.body.innerHTML = `<div style="padding:10px 12px;background:var(--bg)"><label class="search"><span>${ic('search', 18)}</span><input id="ctQ" type="search" autocomplete="off" placeholder="${esc(t('search'))}"></label></div>
      <div class="card" style="margin-top:0;padding:0">${item('users', t('new_group'), { go: 'g', cls: 'on-acc' })}${item('channel', t('new_channel'), { go: 'c', cls: 'on-acc' })}</div><div class="card" id="ctList" style="padding:0"></div>`;
    const draw = () => {
      const q = $('#ctQ', p.body).value.trim().toLowerCase().replace(/^@/, '');
      const us = [...S.users.values()].filter((u) => u.id !== S.me.id && !u.banned && (!q || u.display_name.toLowerCase().includes(q) || u.username.includes(q)))
        .sort((a, b) => (S.online.has(b.id) - S.online.has(a.id)) || a.display_name.localeCompare(b.display_name));
      $('#ctList', p.body).innerHTML = us.length ? us.map((u) => `<div class="urow" data-dm="${u.id}">${avatar(u, 46, { dot: S.online.has(u.id), link: true })}<div class="grow"><div class="nm">${esc(u.display_name)}</div><div class="su ${S.online.has(u.id) ? 'on' : ''}">${esc(seenText(u))}</div></div></div>`).join('') : `<div class="empty">${esc(t('nothing_found'))}</div>`;
    };
    draw();
    $('#ctQ', p.body).oninput = draw;
    p.body.onclick = (e) => {
      const av = e.target.closest('.av[data-user]');
      if (av) return openProfile(Number(av.dataset.user));
      const dm = e.target.closest('[data-dm]');
      if (dm) return openDM(Number(dm.dataset.dm));
      const g = e.target.closest('[data-go]')?.dataset.go;
      if (g === 'g') openNewChat('group'); else if (g === 'c') openNewChat('channel');
    };
  });
}

/* ---------------- user profile (works for everybody, with or without photo) ---------------- */
async function openProfile(uid) {
  if (uid === S.me.id) return openSettings();
  let data = null;
  try { data = await api('/users/' + uid); } catch (e) { return toast(e.message, true); }
  const u = data.user;
  S.users.set(u.id, { ...(S.users.get(u.id) || {}), ...u });
  const dmChat = S.chats.find((c) => c.type === 'dm' && c.peer?.id === uid);
  let media = [];
  if (dmChat) { try { media = (await api(`/chats/${dmChat.id}/media?limit=12`)).media; } catch { /* ignore */ } }
  openPanel((p) => {
    p.setTitle(t('profile'));
    const cur = S.users.get(uid) || u;
    p.body.innerHTML = `<div class="prof">${avatar(cur, 110)}<h2>${esc(cur.display_name)}${cur.role === 'owner' ? ` <span class="badge-off">${esc(t('owner'))}</span>` : ''}</h2>
      <div class="st ${S.online.has(uid) ? 'on' : ''}">${esc(seenText(cur))}</div>
      <div class="actions"><button class="btn" type="button" data-dm>${ic('chat', 20)}${esc(t('send_message'))}</button></div></div>
      <div class="card">${item('at', '@' + cur.username, { sub: t('auth.username'), go: 'copy' })}
        ${cur.bio ? item('info', cur.bio, { sub: t('bio') }) : ''}
        ${item('calendar', F.date.format(cur.created_at), { sub: t('member_since') })}
        ${data.email ? item('mail', data.email, { sub: t('email') }) : ''}</div>
      ${data.common_groups.length ? `<div class="card"><h3>${esc(t('common_groups'))}</h3>${data.common_groups.map((g) => `<div class="urow" data-grp="${g.id}">${avatar(g, 42)}<div class="grow"><div class="nm">${esc(g.title)}</div></div></div>`).join('')}</div>` : ''}
      ${media.length ? `<div class="card"><h3>${esc(t('shared_media'))}</h3><div class="mini-grid">${media.map((m) => `<div class="m" data-open="${esc(m.url)}" data-type="${m.type}">${m.type === 'video' ? `<video src="${esc(m.url)}#t=0.1" preload="metadata" muted></video>` : `<img src="${esc(m.url)}" loading="lazy" alt="">`}</div>`).join('')}</div></div>` : ''}
      ${S.me.role === 'owner' && cur.role !== 'owner' ? `<div class="card">${item(cur.banned ? 'check' : 'ban', cur.banned ? t('unban') : t('ban'), { cls: 'danger', go: 'ban' })}</div>` : ''}`;
    $('[data-dm]', p.body).onclick = () => openDM(uid);
    p.body.addEventListener('click', (e) => {
      const g = e.target.closest('[data-grp]'); if (g) { closeAllPanels(); openChat(Number(g.dataset.grp)); return; }
      const m = e.target.closest('[data-open]'); if (m) openLightbox(m.dataset.open, m.dataset.type);
      if (e.target.closest('[data-go=copy]')) copyText('@' + cur.username);
    });
    const ban = $('[data-go=ban]', p.body);
    ban && armButton(ban, async () => {
      try { const d = await api(`/users/${uid}/ban`, { method: 'POST', body: { banned: !cur.banned } }); S.users.set(uid, d.user); p.refresh(); } catch (e) { toast(e.message, true); }
    });
  });
}

/* ---------------- new group / channel ---------------- */
function openNewChat(kind0 = 'group') {
  openPanel((p) => {
    p.setTitle(t('new_chat'));
    let kind = kind0, photo = null, official = true;
    const isOwner = S.me.role === 'owner';
    p.body.innerHTML = `<div class="seg"><button type="button" data-k="group">${ic('users', 18)}${esc(t('group'))}</button><button type="button" data-k="channel">${ic('channel', 18)}${esc(t('channel'))}</button></div>
      <div class="prof" style="padding-top:10px"><div class="avedit" id="ncAv"></div></div>
      <div class="card"><div class="pad"><label class="field"><span>${esc(t('title'))}</span><input id="ncTitle" maxlength="60"></label>
        <label class="field"><span>${esc(t('description'))}</span><textarea id="ncDesc" maxlength="200"></textarea></label>
        <div id="ncOfficial"></div><div class="hint" id="ncHint" style="color:var(--muted);margin-bottom:10px"></div>
        <div class="err" id="ncErr"></div><button class="btn block" type="button" id="ncGo">${esc(t('create'))}</button></div></div>`;
    const draw = () => {
      $$('.seg button', p.body).forEach((b) => b.classList.toggle('on', b.dataset.k === kind));
      const tmp = { id: 7, title: $('#ncTitle', p.body).value || (kind === 'channel' ? t('channel') : t('group')), avatar: photo ? URL.createObjectURL(photo) : null };
      $('#ncAv', p.body).innerHTML = avatar(tmp, 100) + `<button class="cam" type="button" data-cam>${ic('camera', 18)}</button>`;
      $('#ncOfficial', p.body).innerHTML = isOwner ? item('', t('official_toggle'), { go: 'off', val: sw(official), sub: t('official_sub') }) : '';
      $('#ncHint', p.body).textContent = kind === 'channel' ? t('channel_hint') : t('group_hint');
    };
    draw();
    p.body.onclick = async (e) => {
      const k = e.target.closest('[data-k]');
      if (k) { kind = k.dataset.k; draw(); }
      else if (e.target.closest('[data-cam]')) {
        const f = await pickFile($('#fileOne'), 'image/*'); if (!f) return;
        photo = await resizeImage(f, { max: 512, square: true }); draw();
      } else if (e.target.closest('[data-go=off]')) { official = !official; draw(); }
    };
    $('#ncTitle', p.body).oninput = () => { if (!photo) draw(); };
    $('#ncGo', p.body).onclick = async () => {
      const err = $('#ncErr', p.body); err.textContent = '';
      const btn = $('#ncGo', p.body); btn.disabled = true;
      try {
        const d = await api('/chats/group', { method: 'POST', body: { kind, title: $('#ncTitle', p.body).value, description: $('#ncDesc', p.body).value, official: isOwner ? official : false } });
        let chat = d.chat;
        if (photo) { const fd = new FormData(); fd.append('file', photo, 'g.jpg'); chat = (await api(`/chats/${chat.id}/avatar`, { method: 'POST', form: fd })).chat; }
        upsertChat(chat); closeAllPanels(); renderList(); openChat(chat.id);
        if (!chat.official) setTimeout(() => openChatInfo(chat.id), 350);
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    };
  });
}

/* ---------------- group / channel info ---------------- */
const inviteLink = (c) => `${location.origin}/${c.kind === 'channel' ? 'c' : 'g'}/${c.invite_code}`;
function openChatInfo(id) {
  openPanel((p) => {
    const c = chatById(id);
    if (!c) return p.close();
    const isCh = c.kind === 'channel', mg = c.can_manage;
    p.setTitle(t(isCh ? 'channel_info' : 'group_info'));
    p.body.innerHTML = `<div class="prof"><div class="avedit">${avatar(c, 110)}${mg ? `<button class="cam" type="button" data-cam>${ic('camera', 18)}</button>` : ''}</div>
      <h2>${esc(c.title)}</h2><div class="st">${esc(t(isCh ? 'subs_n' : 'members_n', { n: fnum(c.members || 0) }))}</div>
      ${c.official ? `<div style="margin-top:8px"><span class="badge-off">${ic('verified', 14)} ${esc(t('official'))}</span></div>` : ''}
      ${c.description ? `<div class="bio">${esc(c.description)}</div>` : ''}
      ${mg && c.avatar ? `<div><button class="btn danger" type="button" data-rmav style="margin-top:12px;min-height:36px">${esc(t('remove_photo'))}</button></div>` : ''}</div>
      ${c.official ? `<div class="card"><div class="pad" style="color:var(--muted);font-size:14px">${esc(t('official_note'))}</div></div>` : ''}
      ${c.invite_code ? `<div class="card"><h3>${esc(t('invite_link'))}</h3><div class="copyline"><code>${esc(inviteLink(c))}</code><button class="icon-btn" type="button" data-copy>${ic('copy', 20)}</button>${navigator.share ? `<button class="icon-btn" type="button" data-share>${ic('share', 20)}</button>` : ''}</div>
        ${mg ? item('rotR', t('reset_link'), { go: 'reset' }) : ''}</div>` : ''}
      ${mg ? `<div class="card"><h3>${esc(t('edit'))}</h3><div class="pad"><label class="field"><span>${esc(t('title'))}</span><input id="ciTitle" maxlength="60" value="${esc(c.title)}"></label>
        <label class="field"><span>${esc(t('description'))}</span><textarea id="ciDesc" maxlength="200">${esc(c.description || '')}</textarea></label>
        ${!isCh ? item('', t('only_admins'), { go: 'closed', val: sw(c.closed), sub: t('only_admins_sub') }) : ''}
        <div class="err" id="ciErr"></div><button class="btn block" type="button" id="ciSave">${esc(t('save'))}</button></div></div>` : ''}
      <div class="card"><h3>${esc(t(isCh ? 'subscribers' : 'members'))}</h3><div id="ciMembers"><div class="empty">…</div></div></div>
      <div class="card">${item('clean', t('clear_me'), { go: 'clear' })}
        ${mg ? item('clean', t('clear_all'), { go: 'clearall', cls: 'danger' }) : ''}
        ${!c.official && c.my_role !== 'admin' ? item('logout', t(isCh ? 'leave_channel' : 'leave_group'), { go: 'leave', cls: 'danger' }) : ''}
        ${mg && !c.official ? item('trash', t(isCh ? 'delete_channel' : 'delete_group'), { go: 'delete', cls: 'danger' }) : ''}
        ${mg && c.official ? item('trash', t(isCh ? 'delete_channel' : 'delete_group'), { go: 'delete', cls: 'danger' }) : ''}</div>`;

    // members
    api(`/chats/${id}/members`).then((d) => {
      const box = $('#ciMembers', p.body);
      if (!box) return;
      box.innerHTML = d.members.map(({ user, role }) => `<div class="urow" data-user="${user.id}">${avatar(user, 42, { dot: S.online.has(user.id) })}<div class="grow"><div class="nm">${esc(user.display_name)}${role === 'admin' ? ` <span class="badge-off">${esc(t('admin'))}</span>` : ''}</div><div class="su ${S.online.has(user.id) ? 'on' : ''}">${esc(seenText(user))}</div></div>
        ${mg && !c.official && role !== 'admin' ? `<button class="icon-btn" type="button" data-kick="${user.id}" style="color:var(--danger)">${ic('x', 20)}</button>` : ''}</div>`).join('');
    }).catch(() => {});

    p.body.onclick = async (e) => {
      const kick = e.target.closest('[data-kick]');
      if (kick) { e.stopPropagation(); try { await api(`/chats/${id}/members/${kick.dataset.kick}`, { method: 'DELETE' }); kick.closest('.urow').remove(); c.members = Math.max(0, (c.members || 1) - 1); } catch (er) { toast(er.message, true); } return; }
      const u = e.target.closest('[data-user]'); if (u) return openProfile(Number(u.dataset.user));
      if (e.target.closest('[data-copy]')) return copyText(inviteLink(c));
      if (e.target.closest('[data-share]')) return navigator.share({ title: c.title, url: inviteLink(c) }).catch(() => {});
      if (e.target.closest('[data-cam]')) {
        const f = await pickFile($('#fileOne'), 'image/*'); if (!f) return;
        try { const fd = new FormData(); fd.append('file', await resizeImage(f, { max: 512, square: true }), 'g.jpg'); upsertChat((await api(`/chats/${id}/avatar`, { method: 'POST', form: fd })).chat); renderList(); renderHead(); refreshPanels(); } catch (er) { toast(er.message, true); }
        return;
      }
      if (e.target.closest('[data-rmav]')) { try { upsertChat((await api(`/chats/${id}/avatar`, { method: 'DELETE' })).chat); renderList(); renderHead(); refreshPanels(); } catch (er) { toast(er.message, true); } return; }
      const go = e.target.closest('[data-go]')?.dataset.go;
      if (go === 'reset') { try { upsertChat((await api(`/chats/${id}/invite/reset`, { method: 'POST' })).chat); refreshPanels(); toast(t('link_reset')); } catch (er) { toast(er.message, true); } }
      else if (go === 'closed') { try { upsertChat((await api(`/chats/${id}`, { method: 'PATCH', body: { closed: !c.closed } })).chat); renderComposerState(); refreshPanels(); } catch (er) { toast(er.message, true); } }
    };
    const save = $('#ciSave', p.body);
    save && (save.onclick = async () => {
      try { upsertChat((await api(`/chats/${id}`, { method: 'PATCH', body: { title: $('#ciTitle', p.body).value, description: $('#ciDesc', p.body).value } })).chat); renderList(); renderHead(); toast(t('saved_ok')); refreshPanels(); } catch (er) { $('#ciErr', p.body).textContent = er.message; }
    });
    const A = (g, fn) => { const b = $(`[data-go=${g}]`, p.body); b && armButton(b, fn); };
    A('clear', () => clearHistory(id, 'me'));
    A('clearall', () => clearHistory(id, 'all'));
    A('leave', () => leaveChat(c));
    A('delete', async () => { try { await api('/chats/' + id, { method: 'DELETE' }); } catch (er) { toast(er.message, true); } });
  });
}

/* ---------------- forward ---------------- */
function openForward(m) {
  openPanel((p) => {
    p.setTitle(t('forward_to'));
    const sel = new Set();
    const list = S.chats.filter((c) => canPostLocal(c));
    p.body.innerHTML = `<div class="card" style="padding:0">${list.map((c) => `<div class="urow" data-c="${c.id}">${chatAv(c, 44)}<div class="grow"><div class="nm">${esc(chatName(c))}</div></div><span class="chk">${ic('check', 16, 3)}</span></div>`).join('')}</div>
      <div style="padding:12px 16px"><button class="btn block" type="button" id="fwSend" disabled>${ic('send', 20)}${esc(t('send'))}</button></div>`;
    p.body.onclick = (e) => {
      const r = e.target.closest('[data-c]');
      if (!r) return;
      const id = Number(r.dataset.c);
      sel.has(id) ? sel.delete(id) : sel.add(id);
      $('.chk', r).classList.toggle('on', sel.has(id));
      $('#fwSend', p.body).disabled = !sel.size;
    };
    $('#fwSend', p.body).onclick = async () => {
      try { await api(`/messages/${m.id}/forward`, { method: 'POST', body: { chat_ids: [...sel] } }); toast(t('forwarded')); p.close(); } catch (e) { toast(e.message, true); }
    };
  });
}

/* ---------------- invite links ---------------- */
async function handleInviteRoute() {
  const raw = sessionStorage.getItem('invite');
  if (!raw) return;
  sessionStorage.removeItem('invite');
  const [k, code] = raw.split(':');
  let chat;
  try { chat = (await api(`/invite/${code}?k=${k}`)).chat; } catch (e) { return toast(e.message, true); }
  openPanel((p) => {
    const isCh = chat.kind === 'channel';
    p.setTitle(t(isCh ? 'join_channel' : 'join_group'));
    p.body.innerHTML = `<div class="prof">${avatar(chat, 110)}<h2>${esc(chat.title)}</h2><div class="st">${esc(t(isCh ? 'subs_n' : 'members_n', { n: fnum(chat.members || 0) }))}</div>
      ${chat.description ? `<div class="bio">${esc(chat.description)}</div>` : ''}
      <div class="actions"><button class="btn" type="button" id="ivGo">${esc(chat.is_member ? t('open') : t(isCh ? 'join_channel' : 'join_group'))}</button></div></div>`;
    $('#ivGo', p.body).onclick = async () => {
      try {
        const d = await api(`/invite/${code}/join?k=${k}`, { method: 'POST' });
        upsertChat(d.chat); closeAllPanels(); renderList(); openChat(d.chat.id);
      } catch (e) { toast(e.message, true); }
    };
  });
}
